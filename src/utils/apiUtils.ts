export function assertSerializableRequestPayload(payload: unknown, path = 'payload', seen = new WeakSet()): void {
  if (payload === null || payload === undefined) {
    return;
  }

  const type = typeof payload;

  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new Error(`九屏请求参数包含不可序列化字段：${path}（类型：${type}）`);
  }

  if (type === 'object') {
    if (typeof Event !== 'undefined' && payload instanceof Event) {
      throw new Error(`九屏请求参数包含不可序列化字段：${path}（类型：Event）`);
    }

    if (typeof Element !== 'undefined' && payload instanceof Element) {
      const tagName = (payload as Element).tagName || 'Element';
      throw new Error(`九屏请求参数包含不可序列化字段：${path}（类型：HTML${tagName}Element）`);
    }

    if (
      (payload as any)?.$$typeof ||
      (payload as any)?._owner ||
      (payload as any)?.__reactFiber
    ) {
      throw new Error(`九屏请求参数包含不可序列化字段：${path}（类型：ReactElement/FiberNode）`);
    }

    if (seen.has(payload as object)) {
      throw new Error(`九屏请求参数包含循环引用：${path}`);
    }

    seen.add(payload as object);

    if (Array.isArray(payload)) {
      payload.forEach((item, index) => {
        assertSerializableRequestPayload(item, `${path}[${index}]`, seen);
      });
    } else {
      const proto = Object.getPrototypeOf(payload);
      if (proto !== null && proto !== Object.prototype) {
        const constructorName = (payload as any).constructor?.name || 'Object';
        if (constructorName !== 'Object' && constructorName !== 'Array') {
          throw new Error(`九屏请求参数包含不可序列化对象：${path}（构造函数：${constructorName}）`);
        }
      }

      for (const key of Object.keys(payload as object)) {
        assertSerializableRequestPayload((payload as any)[key], `${path}.${key}`, seen);
      }
    }
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`;

    if (rawText.trim()) {
      try {
        const errorData = JSON.parse(rawText) as {
          error?: string;
          message?: string;
          requestId?: string;
        };

        message =
          errorData.message ||
          errorData.error ||
          message;
      } catch {
        message = rawText.slice(0, 300);
      }
    }

    throw new Error(message);
  }

  if (!rawText.trim()) {
    throw new Error(
      `九屏企划接口返回空响应（HTTP ${response.status}）`
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `九屏企划接口返回了非 JSON 内容：${contentType || "unknown"}`
    );
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(
      `九屏企划接口返回的 JSON 不完整或格式错误，响应长度：${rawText.length}`
    );
  }
}
