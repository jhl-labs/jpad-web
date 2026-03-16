# JPAD Scheduler Templates

이 디렉터리는 운영 배치 예시를 담습니다.

- `cron/jpad-ops.cron`: `/etc/cron.d/jpad-ops` 용 템플릿
- `systemd/`: `jpad-scheduled-job@.service` + 개별 timer 템플릿
- `kubernetes/cronjobs.yaml`: Kubernetes `CronJob` 예시

적용 전 확인:

1. `/srv/jpad` 경로를 실제 배포 경로로 바꿉니다.
2. `jpad` 사용자/그룹을 실제 서비스 계정으로 바꿉니다.
3. `.env` 위치와 `BACKUP_ROOT_DIR`가 런타임과 일치하는지 확인합니다.
4. `deploy/scripts/run-scheduled-job.sh`에 실행 권한을 부여합니다.
5. `audit-log-deliveries`와 `semantic-index-jobs`는 보통 2-5분 간격, `attachment-security-rescan`은 1시간 간격, `backup`/`retention`은 일 단위, `restore-drill`은 주 단위가 적절합니다.
6. Kubernetes처럼 환경 변수를 Secret으로 직접 주입하는 경우 `JPAD_ALLOW_MISSING_ENV_FILE=1`을 설정합니다.

기본 공통 래퍼:

```bash
chmod +x /srv/jpad/deploy/scripts/run-scheduled-job.sh
/srv/jpad/deploy/scripts/run-scheduled-job.sh semantic-index-jobs
/srv/jpad/deploy/scripts/run-scheduled-job.sh audit-log-deliveries
/srv/jpad/deploy/scripts/run-scheduled-job.sh attachment-security-rescan
```
