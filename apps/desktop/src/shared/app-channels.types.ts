/** Desktop 发行渠道 */
export type AppChannel = 'dev' | 'test' | 'prod'

/** 单渠道完整身份与端口约定 */
export type ChannelConfig = {
  channel: AppChannel
  productName: string
  appId: string
  appUserModelId: string
  rendererPort: number
  nativePort: number
  /** 用户主目录下的数据根目录名，如 `.openworker-dev` */
  dataDirName: string
  icon: string
}
