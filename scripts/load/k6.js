// Load test for DD Busy Bees, run with k6 (https://k6.io): see docs/SECURITY.md.
//
//   k6 run -e BASE_URL=https://app.example.com scripts/load/k6.js
//   k6 run -e BASE_URL=... -e PARENT_COOKIE='sb-...=...' -e TEACHER_COOKIE='sb-...=...' scripts/load/k6.js
//
// The busiest moment is about 4 pm on a school day, when the end-of-day SMS goes out and
// parents open the app. With ~100 parents that is roughly 100 people in 10 minutes. This
// runs ten times that: 1,000 parent visits over 10 minutes, plus teachers logging all day.
// Point it at a staging copy, not the live school, and use test accounts.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const PARENT = __ENV.PARENT_COOKIE;
const TEACHER = __ENV.TEACHER_COOKIE;

export const options = {
  scenarios: {
    // Public pages: the login screen and the enquiry form.
    visitors: { executor: "constant-arrival-rate", rate: 2, timeUnit: "1s", duration: "10m", preAllocatedVUs: 20, exec: "visitor" },
    ...(PARENT && {
      parents: { executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1s", preAllocatedVUs: 60,
        stages: [{ target: 2, duration: "2m" }, { target: 2, duration: "6m" }, { target: 0, duration: "2m" }], exec: "parent" },
    }),
    ...(TEACHER && {
      teachers: { executor: "constant-vus", vus: 50, duration: "10m", exec: "teacher" },
    }),
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    checks: ["rate>0.99"],
  },
};

const page = (path, cookie) =>
  http.get(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirects: 0, tags: { name: path } });

export function visitor() {
  check(page("/login"), { "login 200": (r) => r.status === 200 });
  check(page("/enquire"), { "enquire 200": (r) => r.status === 200 });
  sleep(1);
}

export function parent() {
  check(page("/parent", PARENT), { "parent home 200": (r) => r.status === 200 });
  sleep(2);
  check(page("/parent/fees", PARENT), { "fees 200": (r) => r.status === 200 });
  sleep(2);
  check(page("/parent/notices", PARENT), { "notices 200": (r) => r.status === 200 });
}

export function teacher() {
  check(page("/teacher", TEACHER), { "my day 200": (r) => r.status === 200 });
  sleep(5);
  check(page("/teacher/log", TEACHER), { "log page 200": (r) => r.status === 200 });
  sleep(10);
}
