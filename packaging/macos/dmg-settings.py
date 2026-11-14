# dmgbuild settings for Umless-mac-arm64.dmg (scripts/make-dmg.sh passes the paths with -D).
# dmgbuild writes the Finder layout (.DS_Store) itself, so this works on a headless CI runner
# without AppleScript. The window is 660 x 400; the background (packaging/macos/
# dmg-background*.png, from scripts/make-icons.sh) draws a red pen arrow from where Umless.app
# sits to the Applications link.

app = defines["app"]  # noqa: F821 (dmgbuild provides `defines`)

files = [app]
symlinks = {"Applications": "/Applications"}
icon = defines["volume_icon"]  # noqa: F821
background = defines["background"]  # noqa: F821

format = "UDZO"
filesystem = "HFS+"

default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
window_rect = ((200, 140), (660, 400))
icon_size = 128
text_size = 13
icon_locations = {
    "Umless.app": (170, 200),
    "Applications": (490, 200),
}
