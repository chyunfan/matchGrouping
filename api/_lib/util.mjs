// 读取请求体（Vercel Node 函数不会自动解析 JSON body，这里统一处理）
export function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}
