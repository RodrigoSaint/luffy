FROM fedora:37
RUN dnf install 'dnf-command(copr)' -y
# RUN dnf copr enable derisis13/ani-cli -y
RUN dnf install git -y
RUN dnf install fzf -y
RUN dnf install mpv aria2 jq -y
RUN git clone "https://github.com/pystardust/ani-cli.git"
RUN cp ani-cli/ani-cli /usr/local/bin
RUN chmod +x /usr/local/bin/ani-cli
RUN rm -rf ani-cli
WORKDIR /shared_media
VOLUME [ "/shared_media" ]
# https://github.com/pystardust/ani-cli?tab=readme-ov-file#dependencies-1
CMD ["echo", "Ready to run"]