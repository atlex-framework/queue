import type { QueueJobRef } from '@atlex/core'
import { _registerQueueEventJobs } from '@atlex/core'

import { dispatch } from './dispatch.js'
import type { Job } from './Job.js'
import { BroadcastEventJob } from './jobs/events/BroadcastEventJob.js'
import { HandleListenerJob } from './jobs/events/HandleListenerJob.js'

_registerQueueEventJobs({
  dispatch: (job: QueueJobRef) => dispatch(job as Job),
  createBroadcastEventJob: (event) => new BroadcastEventJob(event),
  createHandleListenerJob: (listenerClass, event) => new HandleListenerJob(listenerClass, event),
})
