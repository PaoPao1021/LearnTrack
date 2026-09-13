/**
 * 数据层错误：只抛错误码与参数，UI 层通过 i18n 翻译。
 * message 序列化为 JSON，translateError 在展示端还原为当前语言文案。
 */
export class AppError extends Error {
  readonly code: string;
  readonly params?: Record<string, string | number>;

  constructor(code: string, params?: Record<string, string | number>) {
    super(JSON.stringify({ code, params }));
    this.name = 'AppError';
    this.code = code;
    this.params = params;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
