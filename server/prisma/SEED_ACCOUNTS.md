# Corner Mart demo accounts

All demo accounts use **CornerMart2026!** (bcrypt cost 12).

| Role     | Email                     | Name         |
| -------- | ------------------------- | ------------ |
| Owner    | owner@cornermart.demo     | Sam Taylor   |
| Manager  | manager@cornermart.demo   | Maya Chen    |
| Employee | employee1@cornermart.demo | Alex Rivera  |
| Employee | employee2@cornermart.demo | Jordan Ellis |
| Employee | employee3@cornermart.demo | Aisha Khan   |
| Employee | employee4@cornermart.demo | Noah Brooks  |
| Employee | employee5@cornermart.demo | Priya Shah   |
| Employee | employee6@cornermart.demo | Leo Martin   |

Run `npm run db:seed` to add the demo, recurring availability, Main Street location
(Asia/Karachi), and 30 published shifts for the current Monday–Sunday week.
The seed is additive and idempotent for each week: existing accounts, passwords,
availability and shifts are preserved. Do not use these accounts in production.
Invitations return a unique temporary password once; share it directly with the employee.
