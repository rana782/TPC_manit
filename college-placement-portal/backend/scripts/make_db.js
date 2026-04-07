const { Client } = require('pg');
const url = "postgresql://postgres@localhost:5432/postgres";
async function run() {
    const client = new Client({ connectionString: url });
    await client.connect();
    const res = await client.query('SELECT datname FROM pg_database');
    const dbs = res.rows.map(r => r.datname);
    if (!dbs.includes('placement_db')) {
        await client.query('CREATE DATABASE placement_db');
    }
    await client.end();
    console.log("OK");
}
run().catch(console.error);
