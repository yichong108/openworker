import type { ThemeConfig } from 'antd'

/** ap-web antd 主题，对齐 globals.css 设计 token 与 FIELD 样式。 */
export const apWebAntdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#c4a35a',
    colorLink: 'var(--brass)',
    colorLinkHover: '#d9bc78',
    colorLinkActive: '#a88a42',
    colorText: '#1b140f',
    colorTextPlaceholder: '#5c4e42',
    colorBorder: 'rgba(0, 0, 0, 0.1)',
    colorBgContainer: '#ffffff',
    borderRadius: 8,
    controlHeight: 38,
    fontSize: 14,
    fontFamily: 'var(--font-body), ui-sans-serif, system-ui, sans-serif',
    zIndexPopupBase: 12000
  },
  components: {
    Select: {
      borderRadius: 8,
      controlHeight: 38,
      optionSelectedBg: 'rgba(196, 163, 90, 0.12)',
      optionActiveBg: 'rgba(0, 0, 0, 0.05)'
    },
    Input: {
      borderRadius: 8,
      controlHeight: 38,
      activeBorderColor: '#c4a35a',
      hoverBorderColor: 'rgba(0, 0, 0, 0.2)',
      activeShadow: '0 0 0 2px rgba(196, 163, 90, 0.35)'
    },
    Switch: {
      colorPrimary: '#2a9d8f',
      colorPrimaryHover: '#2a9d8f',
      colorPrimaryActive: '#248f82',
      trackHeight: 20,
      trackMinWidth: 36,
      handleSize: 16
    },
    Radio: {
      colorPrimary: '#2a9d8f',
      wrapperMarginInlineEnd: 0
    },
    DatePicker: {
      borderRadius: 8,
      controlHeight: 28,
      colorPrimary: '#c4a35a',
      activeBorderColor: '#c4a35a',
      hoverBorderColor: 'rgba(0, 0, 0, 0.2)',
      activeShadow: '0 0 0 2px rgba(196, 163, 90, 0.35)'
    },
    InputNumber: {
      borderRadius: 8,
      controlHeight: 28,
      activeBorderColor: '#c4a35a',
      hoverBorderColor: 'rgba(0, 0, 0, 0.2)',
      activeShadow: '0 0 0 2px rgba(196, 163, 90, 0.35)'
    },
    Modal: {
      borderRadiusLG: 16,
      contentBg: '#f3ead9',
      headerBg: 'transparent',
      titleColor: '#1b140f',
      titleFontSize: 24,
      titleLineHeight: 1.3,
      paddingContentHorizontal: 24,
      paddingMD: 24,
      colorIcon: '#5c4e42',
      colorIconHover: '#1b140f'
    },
    Drawer: {
      colorBgElevated: '#1c1814',
      paddingLG: 0
    }
  }
}
