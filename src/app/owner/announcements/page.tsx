import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Notices } from "@/components/notices";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addEvent, deleteAnnouncement, deleteEvent, postAnnouncement } from "./actions";

export default async function AnnouncementsPage() {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const { data: classes } = await supabase.from("classes").select("id, name").eq("archived", false).order("name");
  const classOptions = (
    <>
      <option value="">Whole school</option>
      {classes?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} only
        </option>
      ))}
    </>
  );

  return (
    <>
      <PageHeader title="Notices and calendar" subtitle="Announcements to families, and the school calendar parents and staff see." />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="New announcement">
          <ActionForm action={postAnnouncement}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <Input name="title" required maxLength={120} placeholder="PTA meeting on Saturday" />
              </Field>
              <Field label="Who">
                <Select name="class_id" defaultValue="">
                  {classOptions}
                </Select>
              </Field>
            </div>
            <Field label="Message">
              <Textarea name="body" required maxLength={4000} rows={4} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sms" /> Also send by SMS to each family
            </label>
            <SubmitButton pendingText="Posting…">Post</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Add to the calendar">
          <ActionForm action={addEvent}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What">
                <Input name="title" required maxLength={120} placeholder="Independence Day, school closed" />
              </Field>
              <Field label="Type">
                <Select name="kind" defaultValue="event">
                  <option value="event">Event</option>
                  <option value="closure">School closed</option>
                  <option value="holiday">Holiday</option>
                  <option value="meeting">Meeting</option>
                </Select>
              </Field>
              <Field label="From">
                <Input name="starts_on" type="date" required />
              </Field>
              <Field label="To (optional)">
                <Input name="ends_on" type="date" />
              </Field>
              <Field label="Who">
                <Select name="class_id" defaultValue="">
                  {classOptions}
                </Select>
              </Field>
              <Field label="Notes (optional)">
                <Input name="notes" maxLength={1000} />
              </Field>
            </div>
            <SubmitButton variant="secondary">Add</SubmitButton>
          </ActionForm>
          <p className="mt-2 text-xs text-stone-500">Term dates are added automatically from the terms under Fees.</p>
        </Card>
      </div>
      <Notices
        supabase={supabase}
        announcementExtra={(a) => (
          <form action={deleteAnnouncement.bind(null, a.id)}>
            <button className="min-h-9 text-xs text-red-700 underline">Delete</button>
          </form>
        )}
        eventExtra={(e) => (
          <form action={deleteEvent.bind(null, e.id)}>
            <button className="min-h-9 text-xs text-red-700 underline">Remove</button>
          </form>
        )}
      />
    </>
  );
}
