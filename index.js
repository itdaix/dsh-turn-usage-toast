/**
 * Host half of the Turn-usage toast.
 *
 * Every figure the toast shows already reaches the browser through the Chat
 * snapshot, so this half intentionally contributes nothing: it exists so the
 * bundle row resolves to a real Host plugin and the package can declare its
 * browser artifact beside it.
 */
export function apply() {}
