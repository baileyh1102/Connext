// Fetches a server's Google Calendar iCal feed (looked up from the database
// using the service role, so the raw link is never exposed to the browser)
// and converts it into clean JSON events our React app can render.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Minimal ICS (iCalendar) parser — pulls out just the fields we need from each VEVENT block
function parseICS(icsText: string) {
  const events = []
  const veventBlocks = icsText.split("BEGIN:VEVENT").slice(1)

  for (const block of veventBlocks) {
    const lines = block.split("\n").map((l) => l.trim())
    const event: Record<string, string> = {}

    for (const line of lines) {
      if (line.startsWith("SUMMARY:")) event.summary = line.replace("SUMMARY:", "")
      if (line.startsWith("DTSTART")) event.start = line.split(":")[1]
      if (line.startsWith("DTEND")) event.end = line.split(":")[1]
      if (line.startsWith("LOCATION:")) event.location = line.replace("LOCATION:", "")
      if (line.startsWith("DESCRIPTION:")) event.description = line.replace("DESCRIPTION:", "")
    }

    if (event.summary && event.start) {
      events.push(event)
    }
  }

  return events
}

// Converts ICS date format (e.g. 20260615T140000Z or 20260615) into a standard ISO string
function formatICSDate(icsDate: string) {
  if (icsDate.length === 8) {
    // date-only (all-day event): YYYYMMDD
    return `${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(6, 8)}`
  }
  // full datetime: YYYYMMDDTHHMMSSZ
  const year = icsDate.slice(0, 4)
  const month = icsDate.slice(4, 6)
  const day = icsDate.slice(6, 8)
  const hour = icsDate.slice(9, 11)
  const minute = icsDate.slice(11, 13)
  const second = icsDate.slice(13, 15)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { server_id } = await req.json()
    if (!server_id) {
      throw new Error("Missing server_id")
    }

    // Service role client bypasses RLS — this is what lets us safely read the
    // admin-only calendar link without exposing it to the requesting browser.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: calendarRow, error: lookupError } = await supabaseAdmin
      .from("server_calendars")
      .select("ical_url")
      .eq("server_id", server_id)
      .single()

    if (lookupError || !calendarRow) {
      return new Response(JSON.stringify({ events: [], connected: false }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const response = await fetch(calendarRow.ical_url)
    const icsText = await response.text()
    const rawEvents = parseICS(icsText)

    const events = rawEvents.map((e) => ({
      summary: e.summary,
      start: formatICSDate(e.start),
      end: e.end ? formatICSDate(e.end) : null,
      location: e.location || null,
      description: e.description || null,
    }))

    return new Response(JSON.stringify({ events, connected: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})