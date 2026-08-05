import { describe, it, expect, jest } from '@jest/globals';
import { Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res as Response;
}

describe('response.util', () => {
  describe('sendSuccess', () => {
    it('defaults to a 200 status and wraps data in a success envelope', () => {
      const res = mockResponse();

      sendSuccess(res, { id: 1 });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
    });

    it('includes meta only when provided', () => {
      const res = mockResponse();

      sendSuccess(res, [1, 2, 3], { pagination: { total: 3 } });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [1, 2, 3],
        meta: { pagination: { total: 3 } },
      });
    });

    it('honors a custom status code', () => {
      const res = mockResponse();

      sendSuccess(res, { created: true }, undefined, 201);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { created: true } });
    });
  });

  describe('sendError', () => {
    it('defaults to a 500 status', () => {
      const res = mockResponse();

      sendError(res, 'boom');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'boom' });
    });

    it('honors a custom status code', () => {
      const res = mockResponse();

      sendError(res, 'not found', 404);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'not found' });
    });
  });
});
