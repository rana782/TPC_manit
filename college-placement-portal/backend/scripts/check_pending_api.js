const axios = require('axios');
const BASE_URL = 'http://localhost:5000/api';

async function main() {
    const loginCoord = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'coord_09@example.com',
        password: 'Password@123'
    });
    const coordHeaders = { Authorization: `Bearer ${loginCoord.data.token}` };
    const res = await axios.get(`${BASE_URL}/admin/spocs/pending`, { headers: coordHeaders });
    console.log(JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
