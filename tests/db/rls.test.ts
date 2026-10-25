import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the real migrations against a throwaway Postgres database and checks the
// access rules from each role's point of view. Needs TEST_DATABASE_URL pointing
// at a server where the user can create databases (CI provides one).
const adminUrl = process.env.TEST_DATABASE_URL;
const dbName = `rls_test_${process.pid}`;

const ids = {
  schoolA: "a0000000-0000-0000-0000-000000000001",
  schoolB: "b0000000-0000-0000-0000-000000000001",
  ownerA: "a0000000-0000-0000-0000-0000000000a1",
  adminA: "a0000000-0000-0000-0000-0000000000a2",
  teacher1: "a0000000-0000-0000-0000-0000000000b1",
  teacher2: "a0000000-0000-0000-0000-0000000000b2",
  parent1: "a0000000-0000-0000-0000-0000000000c1",
  parent2: "a0000000-0000-0000-0000-0000000000c2",
  ownerB: "b0000000-0000-0000-0000-0000000000a1",
  class1: "a0000000-0000-0000-0000-0000000000d1",
  class2: "a0000000-0000-0000-0000-0000000000d2",
  classB: "b0000000-0000-0000-0000-0000000000d1",
  child1: "a0000000-0000-0000-0000-0000000000e1",
  child2: "a0000000-0000-0000-0000-0000000000e2",
  childB: "b0000000-0000-0000-0000-0000000000e1",
};

let root: Client;
let db: Client;

async function seed(c: Client) {
  const users = [
    [ids.ownerA, ids.schoolA, "owner", "Owner A"],
    [ids.adminA, ids.schoolA, "admin", "Admin A"],
    [ids.teacher1, ids.schoolA, "teacher", "Teacher One"],
    [ids.teacher2, ids.schoolA, "teacher", "Teacher Two"],
    [ids.parent1, ids.schoolA, "parent", "Parent One"],
    [ids.parent2, ids.schoolA, "parent", "Parent Two"],
    [ids.ownerB, ids.schoolB, "owner", "Owner B"],
  ];
  await c.query(`insert into public.schools (id, name) values ($1, 'School A'), ($2, 'School B')`, [
    ids.schoolA,
    ids.schoolB,
  ]);
  for (const [id, school, role, name] of users) {
    await c.query(`insert into auth.users (id) values ($1)`, [id]);
    await c.query(
      `insert into public.profiles (id, school_id, role, full_name) values ($1, $2, $3, $4)`,
      [id, school, role, name],
    );
  }
  await c.query(
    `insert into public.classes (id, school_id, name) values ($1, $4, 'Bees'), ($2, $4, 'Butterflies'), ($3, $5, 'Other')`,
    [ids.class1, ids.class2, ids.classB, ids.schoolA, ids.schoolB],
  );
  await c.query(
    `insert into public.staff_assignments (teacher_id, class_id, school_id) values ($1, $2, $5), ($3, $4, $5)`,
    [ids.teacher1, ids.class1, ids.teacher2, ids.class2, ids.schoolA],
  );
  await c.query(
    `insert into public.children (id, school_id, class_id, first_name, last_name, date_of_birth) values
      ($1, $4, $5, 'Ama', 'Mensah', '2022-01-01'),
      ($2, $4, $6, 'Kofi', 'Owusu', '2021-06-01'),
      ($3, $7, $8, 'Esi', 'Boateng', '2022-03-01')`,
    [ids.child1, ids.child2, ids.childB, ids.schoolA, ids.class1, ids.class2, ids.schoolB, ids.classB],
  );
  await c.query(
    `insert into public.guardians (parent_id, child_id, school_id, relationship) values
      ($1, $2, $5, 'mother'), ($3, $4, $5, 'father')`,
    [ids.parent1, ids.child1, ids.parent2, ids.child2, ids.schoolA],
  );
}

/**
 * Runs fn as a logged-in user (or anonymous) inside a transaction that is rolled back.
 * Sessions count as two-step verified (aal2) unless told otherwise.
 */
async function as<T>(userId: string | null, fn: (c: Client) => Promise<T>, aal = "aal2"): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${userId ? "authenticated" : "anon"}`);
    const claims = userId ? JSON.stringify({ sub: userId, aal }) : "";
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    return await fn(db);
  } finally {
    await db.query("rollback");
  }
}

async function childIds(userId: string) {
  return as(userId, async (c) => {
    const { rows } = await c.query(`select id from public.children order by id`);
    return rows.map((r) => r.id);
  });
}

describe.skipIf(!adminUrl)("database access rules", () => {
  beforeAll(async () => {
    root = new Client({ connectionString: adminUrl });
    await root.connect();
    await root.query(`drop database if exists ${dbName}`);
    await root.query(`create database ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    await db.query(readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
    const dir = path.join(__dirname, "../../supabase/migrations");
    for (const file of readdirSync(dir).sort()) {
      await db.query(readFileSync(path.join(dir, file), "utf8"));
    }
    await seed(db);
  });

  afterAll(async () => {
    await db?.end();
    await root?.query(`drop database if exists ${dbName}`);
    await root?.end();
  });

  it("gives anonymous visitors no access", async () => {
    await expect(as(null, (c) => c.query(`select * from public.children`))).rejects.toThrow(/permission denied/);
  });

  it("shows a parent only their own child", async () => {
    expect(await childIds(ids.parent1)).toEqual([ids.child1]);
    expect(await childIds(ids.parent2)).toEqual([ids.child2]);
  });

  it("shows a teacher only children in their class", async () => {
    expect(await childIds(ids.teacher1)).toEqual([ids.child1]);
    expect(await childIds(ids.teacher2)).toEqual([ids.child2]);
  });

  it("shows owner and admin every child in their school and none from another school", async () => {
    expect(await childIds(ids.ownerA)).toEqual([ids.child1, ids.child2]);
    expect(await childIds(ids.adminA)).toEqual([ids.child1, ids.child2]);
    expect(await childIds(ids.ownerB)).toEqual([ids.childB]);
  });

  it("gives owner/admin rights only after two-step verification", async () => {
    const seen = await as(ids.adminA, async (c) => (await c.query(`select id from public.children`)).rowCount, "aal1");
    expect(seen).toBe(0);
  });

  it("keeps parents' names and phone numbers away from teachers", async () => {
    const count = await as(ids.teacher1, async (c) => {
      const { rowCount } = await c.query(`select full_name, phone from public.profiles where role = 'parent'`);
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it("stops parents and teachers changing child records", async () => {
    for (const user of [ids.parent1, ids.teacher1]) {
      const updated = await as(user, async (c) => {
        const res = await c.query(`update public.children set allergies = 'x' where id = $1`, [ids.child1]);
        return res.rowCount;
      });
      expect(updated).toBe(0);
      await expect(
        as(user, (c) =>
          c.query(
            `insert into public.children (school_id, first_name, last_name, date_of_birth) values ($1, 'X', 'Y', '2022-01-01')`,
            [ids.schoolA],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("lets an admin enrol a child but not into another school", async () => {
    await as(ids.adminA, (c) =>
      c.query(
        `insert into public.children (school_id, class_id, first_name, last_name, date_of_birth) values ($1, $2, 'Yaw', 'Asante', '2022-02-02')`,
        [ids.schoolA, ids.class1],
      ),
    );
    await expect(
      as(ids.adminA, (c) =>
        c.query(
          `insert into public.children (school_id, first_name, last_name, date_of_birth) values ($1, 'Yaw', 'Asante', '2022-02-02')`,
          [ids.schoolB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks a deactivated account from everything", async () => {
    await db.query(`update public.profiles set active = false where id = $1`, [ids.parent1]);
    try {
      expect(await childIds(ids.parent1)).toEqual([]);
    } finally {
      await db.query(`update public.profiles set active = true where id = $1`, [ids.parent1]);
    }
  });

  it("only lets the owner change roles", async () => {
    await expect(
      as(ids.adminA, (c) => c.query(`update public.profiles set role = 'admin' where id = $1`, [ids.teacher1])),
    ).rejects.toThrow(/only the owner/);
    await as(ids.ownerA, (c) => c.query(`update public.profiles set role = 'admin' where id = $1`, [ids.teacher1]));
  });

  it("stops anyone changing their own role or deactivating themselves", async () => {
    await expect(
      as(ids.ownerA, (c) => c.query(`update public.profiles set role = 'admin' where id = $1`, [ids.ownerA])),
    ).rejects.toThrow(/your own role/);
    const updated = await as(ids.teacher1, async (c) => {
      const res = await c.query(`update public.profiles set role = 'owner' where id = $1`, [ids.teacher1]);
      return res.rowCount;
    });
    expect(updated).toBe(0);
  });

  it("lets an admin deactivate a teacher", async () => {
    const updated = await as(ids.adminA, async (c) => {
      const res = await c.query(`update public.profiles set active = false where id = $1`, [ids.teacher2]);
      return res.rowCount;
    });
    expect(updated).toBe(1);
  });

  it("hides invites from teachers and parents", async () => {
    await db.query(
      `insert into public.invites (school_id, role, full_name, phone, token_hash, created_by) values ($1, 'teacher', 'New Teacher', '+233240000000', 'hash', $2)`,
      [ids.schoolA, ids.ownerA],
    );
    for (const user of [ids.teacher1, ids.parent1]) {
      const count = await as(user, async (c) => (await c.query(`select * from public.invites`)).rowCount);
      expect(count).toBe(0);
    }
    const count = await as(ids.adminA, async (c) => (await c.query(`select * from public.invites`)).rowCount);
    expect(count).toBe(1);
  });

  it("only lets the owner invite another admin", async () => {
    const invite = (c: Client, by: string) =>
      c.query(
        `insert into public.invites (school_id, role, full_name, email, token_hash, created_by) values ($1, 'admin', 'Office', 'office@example.com', $2, $3)`,
        [ids.schoolA, `hash-${by}`, by],
      );
    await expect(as(ids.adminA, (c) => invite(c, ids.adminA))).rejects.toThrow(/row-level security/);
    await as(ids.ownerA, (c) => invite(c, ids.ownerA));
  });

  it("records changes in an audit log only the owner can read and nobody can alter", async () => {
    const rows = await as(ids.adminA, async (c) => {
      await c.query(`update public.children set allergies = 'peanuts' where id = $1`, [ids.child1]);
      await c.query("reset role");
      const res = await c.query(
        `select actor_id, action from public.audit_log where table_name = 'children' and record_id = $1`,
        [ids.child1],
      );
      return res.rows;
    });
    expect(rows).toContainEqual({ actor_id: ids.adminA, action: "update" });

    const ownerSees = await as(ids.ownerA, async (c) => (await c.query(`select * from public.audit_log`)).rowCount);
    expect(ownerSees).toBeGreaterThan(0);
    const adminSees = await as(ids.adminA, async (c) => (await c.query(`select * from public.audit_log`)).rowCount);
    expect(adminSees).toBe(0);
    await expect(as(ids.ownerA, (c) => c.query(`delete from public.audit_log`))).rejects.toThrow(/permission denied/);
  });

  it("rejects invites that point at another school's class or child, or claim another sender", async () => {
    const insert = (c: Client, role: string, column: string, value: string, by: string) =>
      c.query(
        `insert into public.invites (school_id, role, full_name, phone, ${column}, token_hash, created_by) values ($1, $2, 'X', '+233240000009', $3, $4, $5)`,
        [ids.schoolA, role, value, `hash-${column}-${by}`, by],
      );
    await expect(as(ids.adminA, (c) => insert(c, "parent", "child_id", ids.childB, ids.adminA))).rejects.toThrow(
      /another school/,
    );
    await expect(as(ids.adminA, (c) => insert(c, "teacher", "class_id", ids.classB, ids.adminA))).rejects.toThrow(
      /another school/,
    );
    await expect(as(ids.adminA, (c) => insert(c, "teacher", "class_id", ids.class1, ids.ownerA))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("allows only one account per phone number in a school", async () => {
    await expect(
      as(ids.ownerA, (c) => c.query(`update public.profiles set phone = '+233240000001' where id in ($1, $2)`, [ids.parent1, ids.parent2])),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects links between schools", async () => {
    await expect(
      db.query(`insert into public.staff_assignments (teacher_id, class_id, school_id) values ($1, $2, $3)`, [
        ids.teacher1,
        ids.classB,
        ids.schoolA,
      ]),
    ).rejects.toThrow(/crosses schools/);
  });
  describe("daily life", () => {
    const log1 = "a0000000-0000-0000-0000-0000000000f1";

    it("lets a teacher check in only children in their class, as themselves", async () => {
      await as(ids.teacher1, (c) =>
        c.query(`insert into public.attendance (school_id, child_id, checked_in_by) values ($1, $2, $3)`, [
          ids.schoolA,
          ids.child1,
          ids.teacher1,
        ]),
      );
      await expect(
        as(ids.teacher1, (c) =>
          c.query(`insert into public.attendance (school_id, child_id, checked_in_by) values ($1, $2, $3)`, [
            ids.schoolA,
            ids.child2,
            ids.teacher1,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        as(ids.teacher1, (c) =>
          c.query(`insert into public.attendance (school_id, child_id, checked_in_by) values ($1, $2, $3)`, [
            ids.schoolA,
            ids.child1,
            ids.teacher2,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("lets a teacher record check-out but not rewrite the check-in", async () => {
      await db.query(`insert into public.attendance (school_id, child_id, checked_in_by) values ($1, $2, $3)`, [
        ids.schoolA,
        ids.child1,
        ids.teacher1,
      ]);
      try {
        const updated = await as(ids.teacher1, async (c) =>
          (
            await c.query(
              `update public.attendance set checked_out_at = now(), checked_out_by = $2, collected_by = 'Parent One' where child_id = $1`,
              [ids.child1, ids.teacher1],
            )
          ).rowCount,
        );
        expect(updated).toBe(1);
        await expect(
          as(ids.teacher1, (c) =>
            c.query(`update public.attendance set checked_in_at = now() - interval '1 hour' where child_id = $1`, [
              ids.child1,
            ]),
          ),
        ).rejects.toThrow(/school office/);
        await expect(
          as(ids.teacher1, (c) =>
            c.query(`update public.attendance set checked_out_at = now(), checked_out_by = $2 where child_id = $1`, [
              ids.child1,
              ids.teacher2,
            ]),
          ),
        ).rejects.toThrow(/person doing it/);
        expect(await as(ids.parent1, async (c) => (await c.query(`select * from public.attendance`)).rowCount)).toBe(1);
        expect(await as(ids.parent2, async (c) => (await c.query(`select * from public.attendance`)).rowCount)).toBe(0);
      } finally {
        await db.query(`delete from public.attendance`);
      }
    });

    it("gives teachers pick-up names for their own class only, without phone numbers", async () => {
      const mine = await as(ids.teacher1, async (c) => (await c.query(`select * from public.pickup_options($1)`, [ids.child1])).rows);
      expect(mine).toEqual([{ name: "Parent One", relationship: "mother", is_parent: true }]);
      const other = await as(ids.teacher1, async (c) => (await c.query(`select * from public.pickup_options($1)`, [ids.child2])).rowCount);
      expect(other).toBe(0);
      await expect(as(null, (c) => c.query(`select * from public.pickup_options($1)`, [ids.child1]))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("shows a parent a group log but only their own child's tag on it", async () => {
      await as(ids.adminA, async (c) => {
        await c.query(
          `insert into public.activity_logs (id, school_id, kind, body, logged_by) values ($1, $2, 'activity', 'Pouring water', $3)`,
          [log1, ids.schoolA, ids.adminA],
        );
        await c.query(`insert into public.activity_children (log_id, child_id, school_id) values ($1, $2, $4), ($1, $3, $4)`, [
          log1,
          ids.child1,
          ids.child2,
          ids.schoolA,
        ]);
        await c.query("reset role");
        await c.query(`set local role authenticated`);
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.parent1, aal: "aal1" })]);
        const logs = await c.query(`select body from public.activity_logs`);
        const tags = await c.query(`select child_id from public.activity_children`);
        expect(logs.rows).toEqual([{ body: "Pouring water" }]);
        expect(tags.rows).toEqual([{ child_id: ids.child1 }]);
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.ownerB, aal: "aal2" })]);
        expect((await c.query(`select * from public.activity_logs`)).rowCount).toBe(0);
      });
    });

    it("lets a teacher log and tag only their own class, and read back what they wrote", async () => {
      await as(ids.teacher1, async (c) => {
        const { rows } = await c.query(
          `insert into public.activity_logs (school_id, kind, body, logged_by) values ($1, 'meal', 'Ate all', $2) returning id`,
          [ids.schoolA, ids.teacher1],
        );
        await c.query(`insert into public.activity_children (log_id, child_id, school_id) values ($1, $2, $3)`, [
          rows[0].id,
          ids.child1,
          ids.schoolA,
        ]);
        await expect(
          c.query(`insert into public.activity_children (log_id, child_id, school_id) values ($1, $2, $3)`, [
            rows[0].id,
            ids.child2,
            ids.schoolA,
          ]),
        ).rejects.toThrow(/row-level security/);
      });
      await expect(
        as(ids.parent1, (c) =>
          c.query(`insert into public.activity_logs (school_id, kind, body, logged_by) values ($1, 'note', 'x', $2)`, [
            ids.schoolA,
            ids.parent1,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("lets only owner/admin manage tasks, and staff tick only tasks open to them", async () => {
      // Templates are created as the admin and kept for the rest of this test.
      const create = async (c: Client) => {
        const a = await c.query(
          `insert into public.task_templates (school_id, name, frequency) values ($1, 'Check fire extinguisher', 'daily') returning id`,
          [ids.schoolA],
        );
        const b = await c.query(
          `insert into public.task_templates (school_id, name, frequency, weekday, assignee_id) values ($1, 'Clean water tank', 'weekly', 5, $2) returning id`,
          [ids.schoolA, ids.teacher2],
        );
        return [a.rows[0].id, b.rows[0].id];
      };
      await as(ids.adminA, create);
      const [anyone, forTeacher2] = await create(db);
      try {
        await expect(
          as(ids.teacher1, (c) =>
            c.query(`insert into public.task_templates (school_id, name, frequency) values ($1, 'x', 'daily')`, [ids.schoolA]),
          ),
        ).rejects.toThrow(/row-level security/);
        const tick = (c: Client, template: string, by: string, date = "now()") =>
          c.query(
            `insert into public.task_completions (school_id, template_id, due_date, done_by) values ($1, $2, ((${date}) at time zone 'Africa/Accra')::date, $3)`,
            [ids.schoolA, template, by],
          );
        await as(ids.teacher1, (c) => tick(c, anyone, ids.teacher1));
        await expect(as(ids.teacher1, (c) => tick(c, forTeacher2, ids.teacher1))).rejects.toThrow(/row-level security/);
        await as(ids.teacher2, (c) => tick(c, forTeacher2, ids.teacher2));
        await expect(
          as(ids.teacher1, (c) => tick(c, anyone, ids.teacher1, "now() + interval '3 days'")),
        ).rejects.toThrow(/row-level security/);
        expect(await as(ids.parent1, async (c) => (await c.query(`select * from public.task_templates`)).rowCount)).toBe(0);
        expect(await as(ids.ownerB, async (c) => (await c.query(`select * from public.task_templates`)).rowCount)).toBe(0);
        await expect(
          db.query(`update public.task_templates set assignee_id = $2 where id = $1`, [anyone, ids.parent1]),
        ).rejects.toThrow(/staff of this school/);
      } finally {
        await db.query(`delete from public.task_templates`);
      }
    });
  });
});
