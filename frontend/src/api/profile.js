import client from './client'

// Lifetime account balance + trade count + simulated P&L (not date-windowed,
// unlike the Console endpoints). Backed by /profile/overview.
export const getProfileOverview = (signal) => client.get('/profile/overview', { signal })

// Avatar is a client-resized data URI; both endpoints return the updated
// UserProfile so the caller can refresh the auth store.
export const updateAvatar = (dataUri) => client.put('/profile/avatar', { image: dataUri })
export const removeAvatar = () => client.delete('/profile/avatar')

// Preset illustration avatar (key like "men_3"), independent of the photo.
export const setAvatarPreset = (preset) => client.put('/profile/avatar-preset', { preset })
export const removeAvatarPreset = () => client.delete('/profile/avatar-preset')
