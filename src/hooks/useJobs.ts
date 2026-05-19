import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/storage'
import type { Job } from '../types'

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('*, images:job_images(*)')
      .order('created_at', { ascending: true })
    if (data) setJobs(data as Job[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('jobs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_images' }, () => fetchAll())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const createJob = async (title: string, description: string, imageFiles: File[]) => {
    const { data, error } = await supabase
      .from('jobs')
      .insert({ title: title.trim(), description: description.trim() || null })
      .select()
      .single()
    if (error || !data) return { error: error?.message ?? 'สร้างงานไม่ได้' }

    for (const file of imageFiles) {
      const { url, error: uploadErr } = await uploadImage(file, 'jobs')
      if (url) {
        await supabase.from('job_images').insert({ job_id: data.id, image_url: url })
      } else if (uploadErr) {
        console.warn('Image upload failed:', uploadErr)
      }
    }

    fetchAll()
    return { error: null }
  }

  const updateJob = async (id: string, title: string, description: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ title: title.trim(), description: description.trim() || null })
      .eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const revertJob = async (id: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'pending', completed_at: null })
      .eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const completeJob = async (id: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const deleteJob = async (id: string) => {
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const addImages = async (jobId: string, files: File[]) => {
    for (const file of files) {
      const { url } = await uploadImage(file, 'jobs')
      if (url) await supabase.from('job_images').insert({ job_id: jobId, image_url: url })
    }
    fetchAll()
  }

  return { jobs, loading, refresh: fetchAll, createJob, updateJob, revertJob, completeJob, deleteJob, addImages }
}
