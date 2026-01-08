{ pkgs }: {
  deps = [
    pkgs.python310
    pkgs.libopus
    pkgs.ffmpeg
    pkgs.pkg-config
    pkgs.libffi
  ];
}
