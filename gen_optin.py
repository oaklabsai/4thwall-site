#!/usr/bin/env python3
"""
Generate a clean opt-in consent form evidence image for TCR/A2P submission.
Shows two separate, unchecked TCPA-compliant consent checkboxes.
"""
from PIL import Image, ImageDraw, ImageFont
import textwrap

# ── Canvas ──────────────────────────────────────────────────────────────────
W, PAD = 920, 48
BG      = (255, 255, 255)
BORDER  = (220, 220, 220)
LABEL   = (30,  30,  30)
MUTED   = (90,  90,  90)
ORANGE  = (220, 95,  30)
BOX_BG  = (250, 250, 250)
CHECK_BG= (255, 255, 255)

# ── Fonts ────────────────────────────────────────────────────────────────────
def font(size, bold=False):
    try:
        name = "/System/Library/Fonts/Helvetica.ttc"
        return ImageFont.truetype(name, size)
    except:
        return ImageFont.load_default()

F_TITLE  = font(17, bold=True)
F_LABEL  = font(14, bold=True)
F_BODY   = font(12)
F_SMALL  = font(11)
F_TINY   = font(10)

# ── Text blocks ──────────────────────────────────────────────────────────────
MARKETING_TEXT = (
    "I consent to receive marketing text messages from "
    "4th Wall Solutions / Andres Rendon including promotional offers, "
    "lead follow-up, and service updates. Up to 6 messages per month. "
    "Msg & data rates may apply. Reply STOP to opt out. Reply HELP for help. "
    "Consent is not a condition of purchase. SMS opt-in data will not be "
    "shared with or sold to any third parties. View our Privacy Policy "
    "and Terms of Service."
)

TRANSACTIONAL_TEXT = (
    "I consent to receive transactional text messages from "
    "4th Wall Solutions / Andres Rendon including appointment reminders, "
    "job status updates, and review requests. Up to 6 messages per month. "
    "Msg & data rates may apply. Reply STOP to opt out. Reply HELP for help. "
    "Consent is not a condition of purchase. SMS opt-in data will not be "
    "shared with or sold to any third parties. View our Privacy Policy "
    "and Terms of Service."
)

# ── Helpers ──────────────────────────────────────────────────────────────────
def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_width and line:
            lines.append(" ".join(line))
            line = [w]
        else:
            line.append(w)
    if line:
        lines.append(" ".join(line))
    return lines

def text_block_height(draw, text, font, max_width, line_spacing=6):
    lines = wrap_text(draw, text, font, max_width)
    lh = draw.textbbox((0,0),"Ag",font=font)[3] - draw.textbbox((0,0),"Ag",font=font)[1]
    return len(lines) * (lh + line_spacing)

def draw_text_block(draw, text, font, x, y, max_width, color=LABEL, line_spacing=6):
    lines = wrap_text(draw, text, font, max_width)
    lh = draw.textbbox((0,0),"Ag",font=font)[3] - draw.textbbox((0,0),"Ag",font=font)[1]
    cy = y
    for ln in lines:
        draw.text((x, cy), ln, font=font, fill=color)
        cy += lh + line_spacing
    return cy

def draw_checkbox(draw, x, y, size=16, checked=False):
    draw.rectangle([x, y, x+size, y+size], outline=(100,100,100), width=2, fill=CHECK_BG)
    if checked:
        draw.line([x+3, y+8, x+6, y+12, x+13, y+4], fill=(50,120,220), width=2)

def draw_consent_block(draw, img, x, y, w, label, body_text, tag_text):
    """Draw one consent checkbox block. Returns new y."""
    inner_w = w - 2*PAD
    cb_size = 16
    cb_x, cb_y = x + PAD, y + PAD
    text_x   = cb_x + cb_size + 10
    text_w   = inner_w - cb_size - 10

    # measure body height
    tmp = Image.new("RGB",(1,1))
    td  = ImageDraw.Draw(tmp)
    bh  = text_block_height(td, body_text, F_SMALL, text_w, line_spacing=5)
    lh_label = td.textbbox((0,0),"Ag",font=F_LABEL)[3]

    block_h = PAD + lh_label + 6 + bh + PAD

    # block background + border
    draw.rectangle([x, y, x+w, y+block_h],
                   fill=BOX_BG, outline=BORDER, width=1)

    # tag pill (MARKETING / TRANSACTIONAL)
    tag_w = draw.textbbox((0,0), tag_text, font=F_TINY)[2] + 16
    tag_h = 18
    tx = x + w - PAD - tag_w
    ty = y + PAD - 2
    draw.rounded_rectangle([tx, ty, tx+tag_w, ty+tag_h],
                            radius=4, fill=(235,245,255), outline=(180,200,230))
    draw.text((tx+8, ty+3), tag_text, font=F_TINY, fill=(60,100,180))

    # checkbox (unchecked)
    draw_checkbox(draw, cb_x, cb_y + 2)

    # label
    draw.text((text_x, cb_y), label, font=F_LABEL, fill=LABEL)
    body_y = cb_y + lh_label + 6

    # body text
    draw_text_block(draw, body_text, F_SMALL, text_x, body_y, text_w,
                    color=MUTED, line_spacing=5)

    return y + block_h

# ── First pass: measure total height ─────────────────────────────────────────
_tmp_img = Image.new("RGB", (W, 2000), BG)
_td      = ImageDraw.Draw(_tmp_img)
_inner   = W - 2*PAD

HEADER_H = 90
GAP      = 16
FOOTER_H = 60

def measure_block(text, w):
    inner_w = w - 2*PAD
    cb_size = 16
    text_w  = inner_w - cb_size - 10
    bh = text_block_height(_td, text, F_SMALL, text_w, line_spacing=5)
    lh_label = _td.textbbox((0,0),"Ag",font=F_LABEL)[3]
    return PAD + lh_label + 6 + bh + PAD

bh1 = measure_block(MARKETING_TEXT,     W - 2*PAD)
bh2 = measure_block(TRANSACTIONAL_TEXT, W - 2*PAD)

TOTAL_H = PAD + HEADER_H + GAP + bh1 + GAP + bh2 + GAP + FOOTER_H + PAD

# ── Final image ──────────────────────────────────────────────────────────────
img  = Image.new("RGB", (W, TOTAL_H), BG)
draw = ImageDraw.Draw(img)

# outer border
draw.rectangle([0, 0, W-1, TOTAL_H-1], outline=BORDER, width=1)

cy = PAD

# ── Header ───────────────────────────────────────────────────────────────────
draw.text((PAD, cy), "4TH WALL SOLUTIONS", font=F_LABEL, fill=ORANGE)
cy += 22

draw.text((PAD, cy), "SMS Consent — Opt-In Form",
          font=font(20, bold=True), fill=LABEL)
cy += 30

draw.line([(PAD, cy), (W-PAD, cy)], fill=BORDER, width=1)
cy += 12

draw.text((PAD, cy),
          "Select the message types you'd like to receive. "
          "Both checkboxes are optional — consent is not required to submit this form.",
          font=F_BODY, fill=MUTED)
cy += 26

# ── Marketing block ──────────────────────────────────────────────────────────
cy += GAP
cy = draw_consent_block(draw, img,
                         PAD, cy, W - 2*PAD,
                         "Marketing Messages (optional)",
                         MARKETING_TEXT,
                         "MARKETING")
cy += GAP

# ── Transactional block ──────────────────────────────────────────────────────
cy = draw_consent_block(draw, img,
                         PAD, cy, W - 2*PAD,
                         "Transactional Messages (optional)",
                         TRANSACTIONAL_TEXT,
                         "TRANSACTIONAL")
cy += GAP

# ── Footer ───────────────────────────────────────────────────────────────────
draw.line([(PAD, cy), (W-PAD, cy)], fill=BORDER, width=1)
cy += 12

draw.text((PAD, cy),
          "Privacy Policy: https://4thwall.solutions/privacy.html  |  "
          "Terms of Service: https://4thwall.solutions/terms.html",
          font=F_TINY, fill=ORANGE)
cy += 18

draw.text((PAD, cy),
          "SMS opt-in data will not be shared with or sold to any third parties. "
          "Reply STOP to opt out at any time. Msg & data rates may apply.",
          font=F_TINY, fill=MUTED)

# ── Save ─────────────────────────────────────────────────────────────────────
out = "/Users/4thwalldrew/4thwall-site/optin-evidence.png"
img.save(out, "PNG", optimize=True)
print(f"Saved {out}  ({img.size[0]}x{img.size[1]}px)")
