FROM denoland/deno:2.4.2 as builder

WORKDIR /app

COPY package-lock.json .
COPY package.json .
COPY deno.lock .
RUN deno install
COPY src/ ./src/
RUN deno compile --allow-all --output ./lufy ./src/index.ts

FROM fedora:37
RUN dnf install 'dnf-command(copr)' -y
RUN dnf install -y https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
RUN dnf install -y git
RUN dnf install -y ffmpeg which
RUN dnf install fzf -y
RUN dnf install -y mpv aria2 jq -y
COPY --from=builder /app/lufy /usr/local/bin/lufy
WORKDIR /shared_media
VOLUME [ "/shared_media" ]
CMD ["echo", "Ready to run"]