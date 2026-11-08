# Font sources and licenses

Downloaded on **2026-10-20** from the upstream repositories named below. These
files are limited to the weights used by the implemented login, signup and
home screens.

| Local file | Family / weight | Format | Official upstream source |
| --- | --- | --- | --- |
| `PretendardVariable.woff2` | Pretendard variable, `wght` 100–900 (A/B use 400, 700, 800, 900) | WOFF2 | https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2 |
| `Poppins-Bold.ttf` | Poppins 700 (Bold) | TrueType / TTF | https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf |
| `Poppins-Regular.ttf` | Poppins 400 (home coordinates) | TrueType / TTF | https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf |

## Licenses

Both fonts are distributed under the SIL Open Font License 1.1 (OFL-1.1).
The verbatim upstream license files are retained beside the fonts:

- `Pretendard-LICENSE.txt`: https://raw.githubusercontent.com/orioncactus/pretendard/main/LICENSE
- `Poppins-OFL.txt`: https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt

## CSS declarations

```css
@font-face {
  font-family: 'Pretendard';
  src: url('assets/fonts/PretendardVariable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Poppins';
  src: url('assets/fonts/Poppins-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Poppins';
  src: url('assets/fonts/Poppins-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```
