import axios from 'axios';
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});
export function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error?.message ?? 'Unable to reach ShiftSync. Please try again.')
    : 'Something went wrong.';
}
