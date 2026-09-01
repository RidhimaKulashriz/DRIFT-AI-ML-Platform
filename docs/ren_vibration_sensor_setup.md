# Vibration Sensor Integration Guide — For Ren

## Overview

This document provides everything needed to connect the vibration sensor system to the DRIFT platform via Supabase.

## Supabase Project Details

You will need access to the same Supabase project used by DRIFT. Get these values from the project owner:

- **Supabase URL**: `SUPABASE_URL` (from `.env`)
- **Anon Key**: `SUPABASE_ANON_KEY` (from `.env`)
- **Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` (from `.env`)

## Required Tables

Create these tables in the Supabase SQL editor:

### 1. `vibration_sensors`

```sql
CREATE TABLE vibration_sensors (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  anomaly_detected BOOLEAN DEFAULT FALSE,
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  frequency_hz DOUBLE PRECISION DEFAULT 0,
  amplitude DOUBLE PRECISION DEFAULT 0,
  graph_data JSONB DEFAULT '[]',
  priority_contribution INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. `vibration_readings`

```sql
CREATE TABLE vibration_readings (
  id BIGSERIAL PRIMARY KEY,
  sensor_id TEXT NOT NULL REFERENCES vibration_sensors(id),
  timestamp TIMESTAMPTZ NOT NULL,
  frequency_hz DOUBLE PRECISION NOT NULL,
  amplitude DOUBLE PRECISION NOT NULL,
  anomaly_detected BOOLEAN DEFAULT FALSE,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `track_priority_log`

```sql
CREATE TABLE track_priority_log (
  id BIGSERIAL PRIMARY KEY,
  track_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'moderate', 'safe')),
  sensor_anomaly_count INTEGER DEFAULT 0,
  total_priority_contribution INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
```

## API Configuration

### Push Sensor Data

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Push a vibration reading
async function pushReading(sensorId, frequencyHz, amplitude, anomalyDetected) {
  const { data, error } = await supabase
    .from('vibration_readings')
    .insert({
      sensor_id: sensorId,
      timestamp: new Date().toISOString(),
      frequency_hz: frequencyHz,
      amplitude: amplitude,
      anomaly_detected: anomalyDetected,
    })
  
  // Update sensor status
  await supabase
    .from('vibration_sensors')
    .update({
      frequency_hz: frequencyHz,
      amplitude: amplitude,
      anomaly_detected: anomalyDetected,
      severity: amplitude > 7 ? 'critical' : amplitude > 5 ? 'high' : amplitude > 3 ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    })
    .eq('id', sensorId)
  
  return { data, error }
}
```

### Read Sensor Status

```javascript
async function getSensorStatus(sensorId) {
  const { data, error } = await supabase
    .from('vibration_sensors')
    .select('*')
    .eq('id', sensorId)
    .single()
  
  return { data, error }
}
```

## Environment Variables for Your System

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Sensor Data Flow

```
Vibration Sensor Hardware
  ↓ (frequency + amplitude readings)
Your Sensor Software
  ↓ (via Supabase API)
Supabase Database
  ↓ (DRIFT backend polls or subscribes)
DRIFT Backend
  ↓ (priority calculation)
DRIFT Frontend (Train Monitoring)
```

## Priority Contribution

Each sensor's anomaly status contributes to the track's overall priority:
- Critical anomaly: +35 points
- High anomaly: +25 points
- Medium anomaly: +15 points
- Low/none: +2 points

If total sensor contribution + defect severity + traffic impact >= 80 → Track is HIGH PRIORITY.
