# LazyBot agent installation

The agent is an enrolled, user-scoped worker. It only heartbeats and claims work that was confirmed in the web application; it does not create jobs or submit fiscal forms automatically. Device tokens and certificate passphrases are kept in the platform secret store, not in this document or `agent.json`.

## Windows

Build and package from the repository:

```powershell
corepack pnpm --dir apps/agent build
powershell -ExecutionPolicy Bypass -File apps/agent/scripts/package-windows.ps1
```

Copy the package to a user-owned directory, then enroll once. The prompt accepts the development URL, device name, operating system, agent version, and the one-time token copied from **Dispositivos**:

```powershell
& .\lazybot-agent.cmd enroll
& .\lazybot-agent.cmd cert add --responsible <responsible-id> --pfx <path-to-disposable-pfx>
& .\lazybot-agent.cmd run
```

To start on interactive login, review and import `lazybot-agent.xml` with Task Scheduler. It runs as the logged-in user and is intentionally not a privileged service:

```powershell
schtasks /Create /TN LazyBotAgent /XML .\lazybot-agent.xml
schtasks /End /TN LazyBotAgent
schtasks /Delete /TN LazyBotAgent /F
```

## Arch Linux

Install Node.js, `secret-tool`, and the Playwright browser dependencies using the distribution's supported packages. Then:

```bash
corepack pnpm --dir apps/agent build
bash apps/agent/scripts/package-arch.sh
./lazybot-agent enroll
./lazybot-agent cert add --responsible <responsible-id> --pfx <path-to-disposable-pfx>
./lazybot-agent run
```

For a user-level systemd unit:

```bash
install -Dm644 lazybot-agent.service ~/.config/systemd/user/lazybot-agent.service
systemctl --user daemon-reload
systemctl --user enable --now lazybot-agent.service
systemctl --user stop lazybot-agent.service
journalctl --user -u lazybot-agent.service
systemctl --user disable lazybot-agent.service
rm ~/.config/systemd/user/lazybot-agent.service
```

## Operations and removal

Use `cert list` and `cert remove <id>` to manage local certificate metadata. Revoke a device in the web **Dispositivos** screen; the next heartbeat returns `401` and the agent stops retrying with that token. For upgrades, stop the agent, replace the compiled package, and start it again; the user data directory is retained. For complete removal, stop and disable the scheduler/unit, delete the user-scoped LazyBot installation and data directory, and revoke the device in the web application.

The current development host does not provide a supported Windows or Arch installation harness, so this repository records packaging instructions only. No platform installation, enrollment, real certificate, or fiscal submission is claimed here.
