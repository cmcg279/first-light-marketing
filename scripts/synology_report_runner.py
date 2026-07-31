#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run queued First Light audit reports from Synology and upload PDFs to S3.",
    )
    parser.add_argument("--once", action="store_true", help="Run one polling cycle and exit.")
    parser.add_argument(
        "--max-reports",
        type=int,
        default=int(os.environ.get("FIRST_LIGHT_MAX_REPORTS", "1")),
        help="Maximum reports to process per cycle. Defaults to FIRST_LIGHT_MAX_REPORTS or 1.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=int,
        default=int(os.environ.get("FIRST_LIGHT_POLL_SECONDS", "1800")),
        help="Seconds between polling cycles when not using --once.",
    )
    parser.add_argument(
        "--local-queue",
        help="Use a local JSON queue file instead of AWS. Good for first Synology trials.",
    )
    parser.add_argument(
        "--add-local-report",
        metavar="HANDLE",
        help="Append a queued report to --local-queue before processing.",
    )
    parser.add_argument(
        "--local-posts",
        type=int,
        default=30,
        help="Post count for --add-local-report. Defaults to 30.",
    )
    parser.add_argument(
        "--local-ai",
        action="store_true",
        help="Enable DeepSeek recommendations for --add-local-report.",
    )
    parser.add_argument(
        "--local-no-recs",
        action="store_true",
        help="Disable recommendations for --add-local-report.",
    )
    args = parser.parse_args()

    config = RunnerConfig.from_env(local_queue=args.local_queue)
    if args.add_local_report:
        if not config.local_queue:
            raise SystemExit("--add-local-report requires --local-queue")
        add_local_report(
            config.local_queue,
            handle=args.add_local_report,
            post_limit=args.local_posts,
            recommendations_enabled=not args.local_no_recs,
            ai_enabled=args.local_ai,
        )

    while True:
        processed = process_cycle(config, max_reports=args.max_reports)
        if args.once:
            return 0
        if processed == 0:
            print(f"No queued reports. Sleeping for {args.sleep_seconds}s.", flush=True)
        time.sleep(args.sleep_seconds)


class RunnerConfig:
    def __init__(
        self,
        api_url: str,
        runner_token: str,
        audit_script: Path,
        workdir: Path,
        python_bin: str,
        instagram_login: str,
        logo_path: str,
        extra_args: list[str],
        local_queue: Path | None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.runner_token = runner_token
        self.audit_script = audit_script
        self.workdir = workdir
        self.python_bin = python_bin
        self.instagram_login = instagram_login
        self.logo_path = logo_path
        self.extra_args = extra_args
        self.local_queue = local_queue

    @classmethod
    def from_env(cls, local_queue: str | None = None) -> "RunnerConfig":
        api_url = os.environ.get("FIRST_LIGHT_API_URL", "").strip()
        runner_token = os.environ.get("FIRST_LIGHT_RUNNER_TOKEN", "").strip()
        audit_script = Path(os.environ.get("FIRST_LIGHT_AUDIT_SCRIPT", "audit.py")).expanduser()
        workdir = Path(os.environ.get("FIRST_LIGHT_REPORT_WORKDIR", "./audit-reports")).expanduser()
        python_bin = os.environ.get("FIRST_LIGHT_PYTHON", sys.executable or "python3")
        instagram_login = os.environ.get("FIRST_LIGHT_INSTAGRAM_LOGIN", "").strip()
        logo_path = os.environ.get("FIRST_LIGHT_LOGO", "").strip()
        extra_args = shlex.split(os.environ.get("FIRST_LIGHT_AUDIT_EXTRA_ARGS", ""))
        local_queue_path = Path(local_queue).expanduser() if local_queue else None

        if not audit_script.exists():
            raise SystemExit(f"FIRST_LIGHT_AUDIT_SCRIPT does not exist: {audit_script}")
        if not local_queue_path and (not api_url or not runner_token):
            raise SystemExit("FIRST_LIGHT_API_URL and FIRST_LIGHT_RUNNER_TOKEN are required unless --local-queue is used")

        workdir.mkdir(parents=True, exist_ok=True)
        if local_queue_path:
            local_queue_path.parent.mkdir(parents=True, exist_ok=True)
        return cls(
            api_url=api_url,
            runner_token=runner_token,
            audit_script=audit_script,
            workdir=workdir,
            python_bin=python_bin,
            instagram_login=instagram_login,
            logo_path=logo_path,
            extra_args=extra_args,
            local_queue=local_queue_path,
        )


def process_cycle(config: RunnerConfig, max_reports: int) -> int:
    if config.local_queue:
        return process_local_cycle(config, max_reports=max_reports)

    queued = api_request(config, "GET", "/api/runner/audit/reports/queued").get("reports", [])
    reports = queued[:max(0, max_reports)]

    if not reports:
        return 0

    processed = 0
    for report in reports:
        report_id = str(report["id"])
        handle = str(report["handle"])
        print(f"Processing report {report_id} for @{handle}", flush=True)

        try:
            started = api_request(
                config,
                "POST",
                "/api/runner/audit/reports/start",
                {"id": report_id},
            )["report"]
        except RuntimeError as error:
            print(f"Could not claim report {report_id}: {error}", flush=True)
            continue

        pdf_path = config.workdir / str(started.get("fileName") or f"{handle}-audit.pdf")
        try:
            run_audit(config, started, pdf_path)
            upload = api_request(
                config,
                "POST",
                "/api/runner/audit/reports/upload",
                {"id": report_id},
            )
            upload_pdf(str(upload["uploadUrl"]), pdf_path)
            api_request(
                config,
                "POST",
                "/api/runner/audit/reports/complete-upload",
                {"id": report_id, "s3Key": upload["s3Key"]},
            )
            processed += 1
            print(f"Completed report {report_id}: {pdf_path}", flush=True)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            print(f"Report {report_id} failed: {message}", flush=True)
            api_request(
                config,
                "POST",
                "/api/runner/audit/reports/fail",
                {"id": report_id, "errorMessage": message},
            )

    return processed


def process_local_cycle(config: RunnerConfig, max_reports: int) -> int:
    queue = load_local_queue(config.local_queue)
    reports = [
        report for report in queue["reports"]
        if report.get("status") == "queued"
    ][:max(0, max_reports)]

    if not reports:
        return 0

    processed = 0
    for report in reports:
        report_id = str(report["id"])
        handle = str(report["handle"])
        pdf_path = config.workdir / str(report.get("fileName") or f"{handle}-audit.pdf")
        print(f"Processing local report {report_id} for @{handle}", flush=True)

        try:
            update_local_report(config.local_queue, report_id, {"status": "running"})
            report = get_local_report(config.local_queue, report_id)
            run_audit(config, report, pdf_path)
            update_local_report(
                config.local_queue,
                report_id,
                {
                    "status": "completed",
                    "localPdfPath": str(pdf_path),
                    "completedAt": now_iso(),
                    "errorMessage": None,
                },
            )
            processed += 1
            print(f"Completed local report {report_id}: {pdf_path}", flush=True)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            print(f"Local report {report_id} failed: {message}", flush=True)
            update_local_report(
                config.local_queue,
                report_id,
                {"status": "failed", "errorMessage": message},
            )

    return processed


def run_audit(config: RunnerConfig, report: dict[str, Any], pdf_path: Path) -> None:
    handle = str(report["handle"])
    post_limit = int(report.get("postLimit") or 30)
    recommendations_enabled = bool(report.get("recommendationsEnabled"))
    ai_enabled = bool(report.get("aiEnabled"))

    command = [
        config.python_bin,
        str(config.audit_script),
        "--username",
        handle,
        "--posts",
        str(post_limit),
        "--output",
        str(pdf_path),
    ]

    if config.instagram_login:
        command.extend(["--login", config.instagram_login])
    if config.logo_path:
        command.extend(["--logo", config.logo_path])
    if not recommendations_enabled:
        command.append("--no-recs")
    command.extend(config.extra_args)

    env = os.environ.copy()
    if not ai_enabled:
        env.pop("DEEPSEEK_API_KEY", None)

    print("Running audit command:", " ".join(shlex.quote(part) for part in command), flush=True)
    result = subprocess.run(
        command,
        cwd=str(config.audit_script.parent),
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    if result.stdout:
        print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, file=sys.stderr, flush=True)
    if result.returncode != 0:
        raise RuntimeError(f"audit.py exited with {result.returncode}")
    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        raise RuntimeError(f"audit.py did not create a valid PDF at {pdf_path}")


def upload_pdf(upload_url: str, pdf_path: Path) -> None:
    with pdf_path.open("rb") as file:
        data = file.read()

    request = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={
            "Content-Type": "application/pdf",
            "x-amz-server-side-encryption": "AES256",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"S3 upload failed with HTTP {response.status}")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"S3 upload failed with HTTP {error.code}: {body}") from error


def api_request(
    config: RunnerConfig,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = None
    headers = {
        "Authorization": f"Bearer {config.runner_token}",
        "Accept": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        f"{config.api_url}{path}",
        data=body,
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with HTTP {error.code}: {raw}") from error

    if not raw:
        return {}

    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{method} {path} returned non-JSON: {raw[:300]}") from error


def add_local_report(
    queue_path: Path,
    handle: str,
    post_limit: int,
    recommendations_enabled: bool,
    ai_enabled: bool,
) -> None:
    handle = handle.strip().lstrip("@")
    if not handle:
        raise SystemExit("Local report handle is required")

    queue = load_local_queue(queue_path)
    report_id = str(uuid4())
    created_at = now_iso()
    report = {
        "id": report_id,
        "handle": handle,
        "postLimit": max(1, post_limit),
        "recommendationsEnabled": recommendations_enabled,
        "aiEnabled": ai_enabled,
        "status": "queued",
        "fileName": f"{handle}-instagram-audit-{created_at[:10]}.pdf",
        "createdAt": created_at,
        "updatedAt": created_at,
    }
    queue["reports"].append(report)
    save_local_queue(queue_path, queue)
    print(f"Added local report {report_id} for @{handle}", flush=True)


def load_local_queue(queue_path: Path | None) -> dict[str, list[dict[str, Any]]]:
    if queue_path is None:
        raise RuntimeError("Local queue path is required")
    if not queue_path.exists():
        return {"reports": []}

    with queue_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    reports = data.get("reports") if isinstance(data, dict) else None
    if not isinstance(reports, list):
        raise RuntimeError(f"Local queue is invalid: {queue_path}")

    return {"reports": reports}


def save_local_queue(queue_path: Path | None, queue: dict[str, list[dict[str, Any]]]) -> None:
    if queue_path is None:
        raise RuntimeError("Local queue path is required")
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = queue_path.with_suffix(f"{queue_path.suffix}.tmp")
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(queue, file, indent=2)
        file.write("\n")
    temp_path.replace(queue_path)


def get_local_report(queue_path: Path | None, report_id: str) -> dict[str, Any]:
    queue = load_local_queue(queue_path)
    for report in queue["reports"]:
        if report.get("id") == report_id:
            return report
    raise RuntimeError(f"Local report not found: {report_id}")


def update_local_report(queue_path: Path | None, report_id: str, updates: dict[str, Any]) -> None:
    queue = load_local_queue(queue_path)
    updated = False
    for report in queue["reports"]:
        if report.get("id") == report_id:
            for key, value in updates.items():
                if value is None:
                    report.pop(key, None)
                else:
                    report[key] = value
            report["updatedAt"] = now_iso()
            updated = True
            break

    if not updated:
        raise RuntimeError(f"Local report not found: {report_id}")

    save_local_queue(queue_path, queue)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
