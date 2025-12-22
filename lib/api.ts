import { NextResponse } from 'next/server';

export const serverInfo = {
  R1EN_HOST_ETH_ADDR: process.env.R1EN_HOST_ETH_ADDR ?? null,
  R1EN_HOST_ID: process.env.R1EN_HOST_ID ?? null,
};

export function jsonWithServer<T extends Record<string, unknown>>(
  body: T,
  init?: ResponseInit
) {
  return NextResponse.json({ ...body, server: serverInfo }, init);
}
