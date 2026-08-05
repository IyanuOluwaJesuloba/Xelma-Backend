import { describe, it, expect } from "@jest/globals";
import { Response } from "express";
import { sendSuccess, sendError } from "../utils/response";

function mockRes() {
  const res: Partial<Response> & {
    statusCode?: number;
    body?: unknown;
  } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as any;
  return res as Response & { statusCode?: number; body?: any };
}

describe("response helpers", () => {
  it("sendSuccess wraps payload in { success: true, data }", () => {
    const res = mockRes();
    sendSuccess(res, { ok: true });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
  });

  it("sendSuccess includes meta when provided", () => {
    const res = mockRes();
    sendSuccess(res, [1], { pagination: { total: 1 } }, 201);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body).toEqual({
      success: true,
      data: [1],
      meta: { pagination: { total: 1 } },
    });
  });

  it("sendError returns { success: false, error }", () => {
    const res = mockRes();
    sendError(res, "boom", 400);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ success: false, error: "boom" });
  });
});
