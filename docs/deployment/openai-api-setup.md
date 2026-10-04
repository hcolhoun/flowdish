# OpenAI API Production Setup

The OpenAI API key is a Flowdish server secret. It belongs in the Vercel project environment, not in Supabase, browser code or a `NEXT_PUBLIC_` variable.

## Vercel

1. Open the Flowdish project in Vercel.
2. Open **Settings > Environment Variables**.
3. Add `OPENAI_API_KEY` using the Flowdish OpenAI project key.
4. Apply it to **Production** and any Preview environment used for AI testing.
5. Add `OPENAI_MODEL` only if overriding the pinned default. The code currently defaults to `gpt-5.4-mini-2026-03-17`.
6. Redeploy the application after saving the variable.
7. Process a privacy-selected test docket and confirm a new OpenAI row and cost appear under **Admin > AI Usage**.

## Supabase

No OpenAI secret is required in Supabase for the current architecture. Supabase stores Flowdish data; the Next.js server makes the OpenAI request. The database migration in this release must still be applied to Supabase before the new deployment starts receiving traffic.

Apply the checked-in Prisma migration through the normal deployment process:

```powershell
npx prisma migrate deploy
```

## Security

- Never expose the key in client-side code.
- Use a dedicated OpenAI project for Flowdish production.
- Set a project budget and alert in the OpenAI platform.
- Rotate the key if it appears in logs, chat, source control or screenshots.
- Remove `DEEPSEEK_API_KEY` only after the deployed OpenAI flow has passed a real docket test.
