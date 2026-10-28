#!/usr/bin/env bash
#
# groff-fonts - build groff font descriptions for the DejaVu faces.
#
# Why this exists: this build of gropdf accepts PostScript Type 1 only ("this
# implementation only accepts the Type 1 PostScript font", gropdf(1)), while
# Debian ships DejaVu as TrueType. So each face is converted with fontforge,
# its AFM adapted by afmtodit against the same 8-bit encoding gropdf uses, and
# the result installed into a font directory the renderer points groff at with
# -F (see server/groff/render.js). The generated font description files are
# text and could be committed; the PFB/PFA binaries are not, which is why this
# is a script rather than a checked-in blob.
#
# Names follow groff's R/B/I/BI style convention, so the house style can say
# .fam DS (DejaVu Serif) or .fam DM (DejaVu Sans Mono) and .ft B works as it
# does for the built-in Times family.
#
#   sudo scripts/groff-fonts.sh                  # install to the default dir
#   scripts/groff-fonts.sh /some/other/devpdf    # install somewhere else
#
# Requires: fontforge, afmtodit (groff), fonts-dejavu-core + fonts-dejavu-extra.
set -euo pipefail

SRC="${DEJAVU_DIR:-/usr/share/fonts/truetype/dejavu}"
DEST="${1:-/usr/local/share/groff/site-font/devpdf}"
GROFF_LIB="${GROFF_LIB:-/usr/share/groff/1.23.0}"
MAP="$GROFF_LIB/font/devpdf/map/text.map"
ENC="$GROFF_LIB/font/devpdf/enc/text.enc"

for f in fontforge afmtodit; do
    command -v "$f" >/dev/null || { echo "missing: $f" >&2; exit 1; }
done
[ -f "$MAP" ] || { echo "missing map file: $MAP" >&2; exit 1; }
[ -f "$ENC" ] || { echo "missing encoding file: $ENC" >&2; exit 1; }

# ttf-basename : groff font name : PostScript name
# DS = DejaVu Serif (text), DM = DejaVu Sans Mono (code), DV = DejaVu Sans
# (the wide-coverage face, declared as a special font to fill gaps).
FACES=(
    DejaVuSerif.ttf:DSR:DejaVuSerif
    DejaVuSerif-Bold.ttf:DSB:DejaVuSerif-Bold
    DejaVuSerif-Italic.ttf:DSI:DejaVuSerif-Italic
    DejaVuSerif-BoldItalic.ttf:DSBI:DejaVuSerif-BoldItalic
    DejaVuSansMono.ttf:DMR:DejaVuSansMono
    DejaVuSansMono-Bold.ttf:DMB:DejaVuSansMono-Bold
    DejaVuSansMono-Oblique.ttf:DMI:DejaVuSansMono-Oblique
    DejaVuSansMono-BoldOblique.ttf:DMBI:DejaVuSansMono-BoldOblique
    DejaVuSans.ttf:DVR:DejaVuSans
    DejaVuSans-Bold.ttf:DVB:DejaVuSans-Bold
    DejaVuSans-Oblique.ttf:DVI:DejaVuSans-Oblique
    DejaVuSans-BoldOblique.ttf:DVBI:DejaVuSans-BoldOblique
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$DEST"
echo "installing into $DEST"

for entry in "${FACES[@]}"; do
    ttf="${entry%%:*}"
    rest="${entry#*:}"
    name="${rest%%:*}"
    ps="${rest#*:}"

    [ -f "$SRC/$ttf" ] || { echo "  skip $name: no $SRC/$ttf" >&2; continue; }

    # 1. TrueType -> Type 1 (PFB) + metrics (AFM)
    fontforge -lang=ff -c "Open(\"$SRC/$ttf\"); Generate(\"$WORK/$ps.pfb\"); Generate(\"$WORK/$ps.afm\")" \
        >/dev/null 2>"$WORK/ff.err" || { echo "  FAILED $name (fontforge):"; tail -3 "$WORK/ff.err"; continue; }

    # 2. AFM -> groff font description, named for the groff font (DSR, DSB, ...)
    afmtodit -e "$ENC" -f "$ps" "$WORK/$ps.afm" "$MAP" "$WORK/$name" \
        2>"$WORK/afm.err" || { echo "  FAILED $name (afmtodit):"; tail -3 "$WORK/afm.err"; continue; }

    # 3. Install the description, the AFM beside it, and the font itself
    install -m 644 "$WORK/$name" "$DEST/$name"
    install -m 644 "$WORK/$ps.afm" "$DEST/$name.afm"
    install -m 644 "$WORK/$ps.pfb" "$DEST/$name.pfb"
    printf '  %-5s %-22s %s\n' "$name" "$ps" "$(stat -c%s "$DEST/$name.pfb") bytes"
done

# 4. Register the faces for embedding. gropdf reads only the FIRST download file
#    in the font search path, so the default is copied here (this directory is
#    prepended by the renderer's -F) and the DejaVu lines appended to it.
#    An empty foundry field means the line starts with a tab, and the fields are
#    separated by tabs.
DOWN="$DEST/download"
if [ ! -f "$DOWN" ]; then
    cp "$GROFF_LIB/font/devpdf/download" "$DOWN"
    chmod 644 "$DOWN"
    # strip the leading comment block's trailing blank line and keep everything;
    # the original default entries still matter for the built-in families.
fi

# Idempotent: drop any previous DejaVu registrations, then append
grep -v -P "^\tDejaVu" "$DOWN" > "$DOWN.tmp" 2>/dev/null || grep -v "^	DejaVu" "$DOWN" > "$DOWN.tmp"
mv "$DOWN.tmp" "$DOWN"
for entry in "${FACES[@]}"; do
    rest="${entry#*:}"
    name="${rest%%:*}"
    ps="${rest#*:}"
    [ -f "$DEST/$name.pfb" ] && printf '%s\t%s\t%s\n' "" "$ps" "$DEST/$name.pfb" >> "$DOWN"
done
echo "registered $(grep -c "DejaVu" "$DOWN") DejaVu faces in $DOWN"
