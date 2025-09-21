declare module '@netlify/functions' {
  export type Handler = (event: any, context: any) => Promise<{
    statusCode: number
    headers?: Record<string, string>
    body?: string
  }>
}
