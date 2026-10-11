import { ref } from 'vue'

const KEY = 'SimpleMC-launch-instance'
export const launchInstanceId = ref<string | null>(window.localStorage.getItem(KEY))

export function selectLaunchInstance(id: string) {
	launchInstanceId.value = id
	window.localStorage.setItem(KEY, id)
}
