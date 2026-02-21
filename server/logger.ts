const fmt = (level: string, msg: string) =>
  `[${new Date().toISOString()}] ${level}: ${msg}`;

export const logger = {
  info:  (msg: string, ...a: unknown[]) => console.log(fmt("INFO",  msg), ...a),
  warn:  (msg: string, ...a: unknown[]) => console.warn(fmt("WARN",  msg), ...a),
  error: (msg: string, ...a: unknown[]) => console.error(fmt("ERROR", msg), ...a),
};
