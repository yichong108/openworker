"""
生成 OpenWorker 品牌图标。
Hub 版：白底 + 深墨黑猫 + Teal 眼睛。
应用版（无底）：深墨黑猫 + Teal 眼睛。
"""
from PIL import Image, ImageDraw
import os

WHITE = (255, 255, 255, 255)
CAT_BODY = (12, 18, 34, 255)     # #0c1222
TEAL_EYE = (18, 163, 176, 255)   # #12a3b0
TRANSPARENT = (0, 0, 0, 0)


def draw_cat_only(size: int) -> Image.Image:
    """无背景的纯猫 logo（应用内用）"""
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    s = size / 100.0

    draw.polygon([(22*s, 42*s), (32*s, 18*s), (44*s, 36*s)], fill=CAT_BODY)
    draw.polygon([(78*s, 42*s), (68*s, 18*s), (56*s, 36*s)], fill=CAT_BODY)
    draw.ellipse([(50-34)*s, (58-32)*s, (50+34)*s, (58+32)*s], fill=CAT_BODY)
    draw.ellipse([(38-4.5)*s, (54-4.5)*s, (38+4.5)*s, (54+4.5)*s], fill=TEAL_EYE)
    draw.ellipse([(62-4.5)*s, (54-4.5)*s, (62+4.5)*s, (54+4.5)*s], fill=TEAL_EYE)
    return img


def draw_cat_on_circle(size: int, bg_color: tuple = WHITE) -> Image.Image:
    """白色方形底 + 圆底 + 猫（hub 版 / 应用图标用）"""
    img = Image.new('RGBA', (size, size), bg_color)  # 整张方形先填白底
    draw = ImageDraw.Draw(img)
    # 在方形白底上再画个白色圆形（其实一样，但保持逻辑一致）
    draw.ellipse([0, 0, size, size], fill=bg_color)

    # 猫（先画耳朵再画头，猫头覆盖耳朵底部）
    s = size / 100.0
    draw.polygon([(22*s, 42*s), (32*s, 18*s), (44*s, 36*s)], fill=CAT_BODY)
    draw.polygon([(78*s, 42*s), (68*s, 18*s), (56*s, 36*s)], fill=CAT_BODY)
    draw.ellipse([(50-34)*s, (58-32)*s, (50+34)*s, (58+32)*s], fill=CAT_BODY)
    draw.ellipse([(38-4.5)*s, (54-4.5)*s, (38+4.5)*s, (54+4.5)*s], fill=TEAL_EYE)
    draw.ellipse([(62-4.5)*s, (54-4.5)*s, (62+4.5)*s, (54+4.5)*s], fill=TEAL_EYE)
    return img


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # 白底 hub 版
    hub = draw_cat_on_circle(512, bg_color=WHITE)
    hub_path = os.path.join(root, 'assets', 'openworker-icon-hub.png')
    hub.save(hub_path, 'PNG')
    print(f'✅ openworker-icon-hub.png (白底 512x512)')

    # Electron 打包图标
    app_icon = draw_cat_on_circle(512, bg_color=WHITE)
    app_icon.save(os.path.join(root, 'apps', 'desktop', 'resources', 'app-icon.png'), 'PNG')
    print(f'✅ app-icon.png (白底 512x512)')

    # favicon (desktop renderer)
    favicon = draw_cat_on_circle(64, bg_color=WHITE)
    favicon.save(os.path.join(root, 'apps', 'desktop', 'src', 'renderer', 'public', 'favicon.png'), 'PNG')
    print(f'✅ desktop favicon.png (白底 64x64)')

    # favicon (landing 站，用无底猫 + 透明底，配合浏览器标签页更灵活)
    landing_favicon = draw_cat_only(64)
    landing_favicon.save(os.path.join(root, 'apps', 'landing', 'public', 'favicon.png'), 'PNG')
    print(f'✅ landing favicon.png (透明底 64x64)')

    # Windows ICO
    img_ico = draw_cat_on_circle(256, bg_color=WHITE)
    ico_sizes = [16, 24, 32, 40, 48, 64, 128, 256]
    for d in [
        'apps/desktop/release/.icon-ico',
        'apps/desktop/release/test/.icon-ico',
        'apps/desktop/release/prod/.icon-ico',
    ]:
        full = os.path.join(root, d)
        os.makedirs(full, exist_ok=True)
        img_ico.save(os.path.join(full, 'icon.ico'),
                     format='ICO', sizes=[(s, s) for s in ico_sizes])
    print(f'✅ icon.ico × 3 (白底)')

    print('\n🎉 全部图标生成完毕！')


if __name__ == '__main__':
    main()
