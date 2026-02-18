export async function getDeviceId() {
    let dId = window.localStorage.getItem('d_id');
    if (dId) {
        return dId;
    }

    const res = await fetch(`/api/devices`, {
        method: 'POST'
    });

    const data = await res.json();

    const { deviceId } = data;

    dId = deviceId;

    window.localStorage.setItem('d_id', dId as string);

    return dId;
}