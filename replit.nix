{pkgs}: {
  deps = [
    pkgs.mesa
    pkgs.pango
    pkgs.cairo
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libxcb
    pkgs.xorg.libXext
    pkgs.xorg.libX11
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.cups
    pkgs.dbus
    pkgs.at-spi2-core
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nspr
    pkgs.nss
    pkgs.glib
    pkgs.chromium
  ];
}
