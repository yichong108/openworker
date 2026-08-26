import type { ThemeConfig } from 'antd'

/** ap-web 下拉选择器主题，对齐 globals.css 设计 token 与 FIELD 样式。 */
export const apWebAntdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#c4a35a',
    colorText: '#1b140f',
    colorTextPlaceholder: '#5c4e42',
    colorBorder: 'rgba(0, 0, 0, 0.1)',
    colorBgContainer: '#ffffff',
    borderRadius: 8,
    controlHeight: 38,
    fontSize: 14,
    fontFamily: 'var(--font-body), ui-sans-serif, system-ui, sans-serif'
  },
  components: {
    Select: {
      borderRadius: 8,
      controlHeight: 38,
      optionSelectedBg: 'rgba(196, 163, 90, 0.12)',
      optionActiveBg: 'rgba(0, 0, 0, 0.05)'
    }
  }
}
