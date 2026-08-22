import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { remarkLinkifyBareUrls } from './plugins.js'

export const defaultMarkdownRemarkPlugins = [remarkGfm, remarkLinkifyBareUrls]
export const defaultMarkdownRehypePlugins = [rehypeHighlight]
