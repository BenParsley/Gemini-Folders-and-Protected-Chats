(() => {
  const MENU_ACTION_TERMS = Object.freeze({
    chatActions: Object.freeze({
      share: Object.freeze({
        icons: ['share'],
        terms: ['share conversation', 'share']
      }),
      pinOn: Object.freeze({
        icons: ['push_pin', 'keep_off'],
        terms: ['pin', 'anclar', 'fixer', 'heften', 'fixar', 'fissa', '固定', 'закреп']
      }),
      pinOff: Object.freeze({
        icons: ['keep_off', 'push_pin'],
        terms: ['unpin', 'un pin', 'desanclar', 'desfijar', 'détacher', 'lösen', '解除固定', 'закреп']
      }),
      rename: Object.freeze({
        icons: ['edit', 'drive_file_rename_outline'],
        terms: ['rename', 'edit name', 'renombrar', 'renommer', 'umbenennen', 'rinomina', '名前を変更', '重命名']
      }),
      delete: Object.freeze({
        icons: ['delete'],
        terms: ['delete', 'remove', 'eliminar', 'supprimer', 'löschen', 'excluir', 'cancella', '削除', '删除', '삭제', 'удал']
      })
    }),
    deleteTerms: Object.freeze([
      'delete',
      'remove',
      'eliminar',
      'elimina',
      'supprimer',
      'löschen',
      'excluir',
      'cancella',
      '削除',
      '删除',
      '삭제',
      'удал'
    ])
  });

  window.GFMenuActionTerms = MENU_ACTION_TERMS;
})();
