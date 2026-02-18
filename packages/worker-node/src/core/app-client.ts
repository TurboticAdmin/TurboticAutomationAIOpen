import axios, { AxiosInstance } from 'axios';

let appClient: AxiosInstance;

export function createAppClient(baseURL: string) {
    appClient = axios.create({
        baseURL: baseURL
    });
}

export function getAppClient() {
    return appClient;
}