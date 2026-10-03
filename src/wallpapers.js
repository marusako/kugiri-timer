// デフォルトの壁紙の一覧。絵そのものは style.css の [data-wallpaper='<id>'] に CSS で描いている
// (画像ファイルを使わないので、ライセンスの心配がなく、アプリの容量も増えない)

export const WALLPAPER_PRESETS = Object.freeze([
  { id: 'dawn', name: 'Dawn' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'forest', name: 'Forest' },
  { id: 'night', name: 'Night' },
  { id: 'paper', name: 'Paper' },
]);
