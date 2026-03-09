/**
 * Slash menu configuration for SimpleNotionEditor (without AI features)
 */

import type { SlashMenuConfig } from '@/components/tiptap-ui/slash-dropdown-menu/use-slash-dropdown-menu'

/**
 * Slash menu items excluding AI features
 */
export const simpleSlashMenuConfig: SlashMenuConfig = {
  enabledItems: [
    // Style items
    'text',
    'heading_1',
    'heading_2',
    'heading_3',
    'bullet_list',
    'ordered_list',
    'task_list',
    'quote',
    'code_block',

    // Insert items
    // 'mention', // Collaboration feature - disabled
    'emoji',
    'divider',

    // Upload items
    // 'image',
  ],
  showGroups: true,
}
