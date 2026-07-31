import { supabaseAdmin } from '../src/lib/supabase';
async function createAdmin() {
    const employeeId = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (!employeeId || !password || password.length < 6) {
        console.error('Error: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required, and password must be at least 6 characters.');
        process.exit(1);
    }

    const email = `${employeeId}@manwah.com`;
    const authResponse = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
    });
    
    if (authResponse.error) {
        console.error('Error:', authResponse.error);
        if (authResponse.error.message.includes('already exists') || authResponse.error.message.includes('already been registered')) {
            const { data } = await supabaseAdmin.auth.admin.listUsers();
            const user = data.users.find(u => u.email === email);
            if (user) {
                await supabaseAdmin.auth.admin.updateUserById(user.id, { password: password }).catch(e => console.log('user pass update error', e));
                await updateProfile(user.id, employeeId);
            }
        }
    } else {
        console.log('Created admin:', authResponse.data?.user?.id);
        await updateProfile(authResponse.data.user.id, employeeId);
    }
}

async function updateProfile(id: string, employeeId: string) {
    await new Promise(r => setTimeout(r, 1000));
    const { error } = await supabaseAdmin.from('profiles').update({
        employee_id: employeeId,
        username: employeeId,
        role: 'admin',
        quota_limit: 100000000
    }).eq('id', id);
    if (error) console.error('Profile error:', error);
    else console.log('Profile updated info');
}
createAdmin();