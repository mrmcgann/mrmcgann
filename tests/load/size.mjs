// Reads the test database's size so scripts work at any scale.
export async function SIZE_FROM_DB(c) {
  const { rows: [r] } = await c.query(`select
    (select count(*) from profiles where id_status='verified')::int verified,
    (select count(*) from profiles)::int users,
    (select count(*) from lots)::int lots,
    (select count(*) from lots where id between 100001 and 100000 + (select count(*) from lots where status='live' and id < 200000))::int live`);
  return { VERIFIED: r.verified, USERS: r.users, LOTS: r.lots, LIVE: r.live };
}
