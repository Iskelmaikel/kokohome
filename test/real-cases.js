// The live dashboard configs (generated), rendered against states copied from the real house.
export const CASES = [
 {
  "id": "home-0-1-status-island",
  "wide": true,
  "config": {
   "type": "custom:kokonut-status-island",
   "idle_label": "All quiet at home",
   "items": [
    {
     "entity": "binary_sensor.reolink_video_doorbell_wifi_visitor",
     "label": "Someone's at the door",
     "status": "error",
     "done_label": false,
     "action": {
      "label": "View",
      "action": "navigate",
      "navigation_path": "/lovelace/cameras"
     }
    },
    {
     "entity": "script.play_youtube_on_lg_tv",
     "label": "Starting Dog TV",
     "done_label": "Dog TV is on"
    },
    {
     "entity": "sensor.grillplats_plug_power",
     "above": 5,
     "label": "Grill plate is on",
     "done_label": "Grill plate off",
     "action": {
      "label": "Turn off",
      "action": "perform-action",
      "perform_action": "switch.turn_off",
      "target": {
       "entity_id": "switch.grillplats_plug"
      }
     }
    },
    {
     "entity": "media_player.living_room"
    },
    {
     "entity": "media_player.living_room_lg_tv"
    },
    {
     "entity": "media_player.living_room_speaker"
    }
   ]
  }
 },
 {
  "id": "home-0-2-split-flap",
  "wide": false,
  "config": {
   "type": "custom:kokonut-split-flap",
   "clock": true
  }
 },
 {
  "id": "home-0-3-lightbox-grid",
  "wide": true,
  "config": {
   "type": "custom:kokonut-lightbox-grid",
   "entities": [
    "camera.192_168_1_156",
    "camera.reolink_video_doorbell_wifi_fluent"
   ]
  }
 },
 {
  "id": "home-0-4-particle-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-particle-button",
   "entity": "script.play_youtube_on_lg_tv",
   "name": "Play Dog TV",
   "icon": "mdi:dog",
   "pending_label": "Starting",
   "success_label": "Dog TV is on"
  }
 },
 {
  "id": "home-0-5-hold-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-hold-button",
   "name": "Hold: all lights off",
   "holding_label": "Keep holding",
   "complete_label": "All lights off",
   "icon": "mdi:lightbulb-group-off",
   "variant": "grey",
   "hold_action": {
    "action": "perform-action",
    "perform_action": "light.turn_off",
    "target": {
     "entity_id": [
      "light.living_room_lights",
      "light.living_room_wall_light_grp_1",
      "light.standing_light_1",
      "light.dinner_table_light",
      "light.kitchen",
      "light.hallway_lights",
      "light.entrance_hall_light",
      "light.ledstrips_staircase_light",
      "light.bedroom_light_1",
      "light.bedside_1",
      "light.bedside_2",
      "light.office_light_1",
      "light.office_maikel_desk",
      "light.0x70ac08fffe838cc2",
      "light.backyard_light_1",
      "light.front_door_light"
     ]
    }
   }
  }
 },
 {
  "id": "home-0-6-bell-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-bell-button",
   "entity": "switch.reolink_video_doorbell_wifi_push_notifications",
   "ring_entity": "binary_sensor.reolink_video_doorbell_wifi_visitor",
   "name": "Doorbell alerts",
   "label": "Notify me",
   "subscribed_label": "Notifying"
  }
 },
 {
  "id": "home-1-4-detent-dial",
  "wide": false,
  "config": {
   "type": "custom:kokonut-detent-dial",
   "entity": "climate.153931628792947_climate",
   "name": "Air conditioning"
  }
 },
 {
  "id": "home-1-5-wheel-picker",
  "wide": false,
  "config": {
   "type": "custom:kokonut-wheel-picker",
   "name": false,
   "columns": [
    {
     "entity": "climate.153931628792947_climate"
    },
    {
     "entity": "climate.153931628792947_climate",
     "attribute": "fan_mode"
    },
    {
     "entity": "climate.153931628792947_climate",
     "attribute": "swing_mode"
    }
   ]
  }
 },
 {
  "id": "home-1-10-swipe-tabs",
  "wide": false,
  "config": {
   "type": "custom:kokonut-swipe-tabs",
   "tabs": [
    {
     "title": "Apple TV",
     "icon": "mdi:apple",
     "cards": [
      {
       "type": "custom:kokonut-now-playing",
       "entity": "media_player.living_room",
       "name": "Apple TV"
      }
     ]
    },
    {
     "title": "Speaker",
     "icon": "mdi:speaker",
     "cards": [
      {
       "type": "custom:kokonut-now-playing",
       "entity": "media_player.living_room_speaker",
       "name": "Speaker"
      }
     ]
    }
   ]
  }
 },
 {
  "id": "home-1-11-liquid-slider",
  "wide": false,
  "config": {
   "type": "custom:kokonut-liquid-slider",
   "entity": "media_player.living_room_lg_tv",
   "name": "TV volume",
   "color": "sky"
  }
 },
 {
  "id": "home-1-12-hold-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-hold-button",
   "entity": "script.turn_off_living_room_tv",
   "name": "Hold: TV off",
   "complete_label": "TV off",
   "icon": "mdi:television-off",
   "variant": "red"
  }
 },
 {
  "id": "home-2-4-detent-dial",
  "wide": false,
  "config": {
   "type": "custom:kokonut-detent-dial",
   "entity": "climate.152832117166401_climate",
   "name": "Air conditioning"
  }
 },
 {
  "id": "home-2-5-wheel-picker",
  "wide": false,
  "config": {
   "type": "custom:kokonut-wheel-picker",
   "name": false,
   "columns": [
    {
     "entity": "climate.152832117166401_climate"
    },
    {
     "entity": "climate.152832117166401_climate",
     "attribute": "fan_mode"
    },
    {
     "entity": "climate.152832117166401_climate",
     "attribute": "swing_mode"
    }
   ]
  }
 },
 {
  "id": "home-8-1-spending-ring",
  "wide": false,
  "config": {
   "type": "custom:kokonut-spending-ring",
   "title": "Electricity today",
   "period": "day",
   "entities": [
    {
     "entity": "sensor.energy_consumed_tariff_1",
     "name": "Low tariff",
     "color": "sky"
    },
    {
     "entity": "sensor.energy_consumed_tariff_2",
     "name": "Normal tariff",
     "color": "amber"
    }
   ]
  }
 },
 {
  "id": "dog-tv-1-3-particle-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-particle-button",
   "entity": "script.play_youtube_on_lg_tv",
   "name": "Play",
   "icon": "mdi:play",
   "pending_label": "Starting",
   "success_label": "Playing soon"
  }
 },
 {
  "id": "dog-tv-1-4-hold-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-hold-button",
   "entity": "script.turn_off_living_room_tv",
   "name": "Hold: TV off",
   "complete_label": "TV off",
   "icon": "mdi:television-off",
   "variant": "red"
  }
 },
 {
  "id": "dog-tv-1-5-liquid-slider",
  "wide": false,
  "config": {
   "type": "custom:kokonut-liquid-slider",
   "entity": "media_player.living_room_lg_tv",
   "name": "Volume",
   "color": "sky"
  }
 },
 {
  "id": "lights-0-1-hold-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-hold-button",
   "name": "Hold: all lights off",
   "complete_label": "All lights off",
   "icon": "mdi:lightbulb-group-off",
   "variant": "grey",
   "hold_action": {
    "action": "perform-action",
    "perform_action": "light.turn_off",
    "target": {
     "entity_id": [
      "light.living_room_lights",
      "light.living_room_wall_light_grp_1",
      "light.standing_light_1",
      "light.dinner_table_light",
      "light.kitchen",
      "light.hallway_lights",
      "light.entrance_hall_light",
      "light.ledstrips_staircase_light",
      "light.bedroom_light_1",
      "light.bedside_1",
      "light.bedside_2",
      "light.office_light_1",
      "light.office_maikel_desk",
      "light.0x70ac08fffe838cc2",
      "light.backyard_light_1",
      "light.front_door_light"
     ]
    }
   }
  }
 },
 {
  "id": "lights-1-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.living_room_lights",
   "name": "Ceiling"
  }
 },
 {
  "id": "lights-1-2-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.living_room_wall_light_grp_1",
   "name": "Wall"
  }
 },
 {
  "id": "lights-1-3-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.standing_light_1",
   "name": "Floor lamp"
  }
 },
 {
  "id": "lights-1-4-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.dinner_table_light",
   "name": "Dinner"
  }
 },
 {
  "id": "lights-2-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.bedroom_light_1",
   "name": "Ceiling"
  }
 },
 {
  "id": "lights-2-2-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.bedside_1",
   "name": "Sanako"
  }
 },
 {
  "id": "lights-2-3-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.bedside_2",
   "name": "Maikel"
  }
 },
 {
  "id": "lights-3-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.kitchen",
   "name": "Kitchen"
  }
 },
 {
  "id": "lights-4-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.hallway_lights",
   "name": "Hallway"
  }
 },
 {
  "id": "lights-4-2-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.entrance_hall_light",
   "name": "Entrance"
  }
 },
 {
  "id": "lights-4-3-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.ledstrips_staircase_light",
   "name": "Staircase"
  }
 },
 {
  "id": "lights-5-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.office_light_1",
   "name": "Ceiling"
  }
 },
 {
  "id": "lights-5-2-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.office_maikel_desk",
   "name": "Desk lamp"
  }
 },
 {
  "id": "lights-6-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.0x70ac08fffe838cc2",
   "name": "Ceiling"
  }
 },
 {
  "id": "lights-7-1-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.backyard_light_1",
   "name": "Backyard"
  }
 },
 {
  "id": "lights-7-2-lamp",
  "wide": false,
  "config": {
   "type": "custom:kokonut-lamp",
   "entity": "light.front_door_light",
   "name": "Front door"
  }
 },
 {
  "id": "cameras-0-1-lightbox-grid",
  "wide": true,
  "config": {
   "type": "custom:kokonut-lightbox-grid",
   "entities": [
    "camera.reolink_video_doorbell_wifi_fluent",
    "camera.192_168_1_156"
   ]
  }
 },
 {
  "id": "cameras-1-2-bell-button",
  "wide": false,
  "config": {
   "type": "custom:kokonut-bell-button",
   "entity": "switch.reolink_video_doorbell_wifi_push_notifications",
   "ring_entity": "binary_sensor.reolink_video_doorbell_wifi_visitor",
   "name": "Doorbell alerts",
   "label": "Notify me",
   "subscribed_label": "Notifying"
  }
 },
 {
  "id": "cameras-3-1-uptime-card",
  "wide": false,
  "config": {
   "type": "custom:kokonut-uptime-card",
   "days": 10,
   "entities": [
    {
     "entity": "camera.reolink_video_doorbell_wifi_fluent",
     "name": "Doorbell"
    },
    {
     "entity": "camera.192_168_1_156",
     "name": "Dog camera"
    }
   ]
  }
 },
 {
  "id": "energy-0-1-metric-card",
  "wide": true,
  "config": {
   "type": "custom:kokonut-metric-card",
   "name": "Electricity used",
   "periods": [
    7,
    30,
    90
   ],
   "default_period": 30,
   "higher_is_better": false,
   "segments": [
    {
     "entity": "sensor.energy_consumed_tariff_1",
     "name": "Low tariff"
    },
    {
     "entity": "sensor.energy_consumed_tariff_2",
     "name": "Normal tariff"
    }
   ]
  }
 },
 {
  "id": "energy-0-2-activity-terrain",
  "wide": true,
  "config": {
   "type": "custom:kokonut-activity-terrain",
   "entity": "sensor.energy_consumed_tariff_2",
   "name": "Daily use, normal tariff",
   "weeks": 26,
   "height": 260
  }
 },
 {
  "id": "energy-1-1-spending-ring",
  "wide": false,
  "config": {
   "type": "custom:kokonut-spending-ring",
   "title": "Today vs yesterday",
   "period": "day",
   "entities": [
    {
     "entity": "sensor.energy_consumed_tariff_1",
     "name": "Low tariff",
     "color": "sky"
    },
    {
     "entity": "sensor.energy_consumed_tariff_2",
     "name": "Normal tariff",
     "color": "amber"
    },
    {
     "entity": "sensor.grillplats_plug_energy",
     "name": "Grill plate",
     "color": "emerald"
    }
   ]
  }
 },
 {
  "id": "energy-1-2-spending-ring",
  "wide": false,
  "config": {
   "type": "custom:kokonut-spending-ring",
   "title": "This month",
   "period": "month",
   "entities": [
    {
     "entity": "sensor.energy_consumed_tariff_1",
     "name": "Low tariff",
     "color": "sky"
    },
    {
     "entity": "sensor.energy_consumed_tariff_2",
     "name": "Normal tariff",
     "color": "amber"
    }
   ]
  }
 },
 {
  "id": "energy-3-1-uptime-card",
  "wide": false,
  "config": {
   "type": "custom:kokonut-uptime-card",
   "days": 10,
   "entities": [
    {
     "entity": "media_player.living_room_lg_tv",
     "name": "LG TV",
     "down_states": [
      "unavailable"
     ]
    },
    {
     "entity": "sensor.energy_consumed_tariff_2",
     "name": "Energy meter"
    },
    {
     "entity": "switch.grillplats_plug",
     "name": "Grill plate plug"
    },
    {
     "entity": "camera.reolink_video_doorbell_wifi_fluent",
     "name": "Doorbell"
    },
    {
     "entity": "camera.192_168_1_156",
     "name": "Dog camera"
    }
   ]
  }
 }
]
export const STATES = {
'climate.153931628792947_climate': { entity_id: 'climate.153931628792947_climate', state: 'off', attributes: {"friendly_name": "Living Room AC", "hvac_modes": ["off", "auto", "cool", "dry", "heat", "fan_only"], "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5, "fan_modes": ["silent", "low", "medium", "high", "full", "auto"], "swing_modes": ["off", "vertical", "horizontal", "both"], "preset_modes": ["none", "comfort", "boost", "sleep", "away"], "current_temperature": 29.9, "temperature": 22, "fan_mode": "auto", "swing_mode": "off", "supported_features": 441}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'climate.152832117166401_climate': { entity_id: 'climate.152832117166401_climate', state: 'heat', attributes: {"friendly_name": "Bedroom AC", "hvac_modes": ["off", "auto", "cool", "dry", "heat", "fan_only"], "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5, "fan_modes": ["silent", "low", "medium", "high", "full", "auto"], "swing_modes": ["off", "vertical", "horizontal", "both"], "preset_modes": ["none", "comfort", "boost", "sleep", "away"], "current_temperature": 20.5, "temperature": 21, "fan_mode": "auto", "swing_mode": "off", "supported_features": 441}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'media_player.living_room': { entity_id: 'media_player.living_room', state: 'paused', attributes: {"friendly_name": "Living Room", "media_title": "48 hours in Hokkaido", "media_artist": "Abroad in Japan", "media_duration": 1136, "media_position": 1, "media_position_updated_at": "2026-11-09T21:22:00+00:00", "app_name": "YouTube", "supported_features": 450487}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'media_player.living_room_lg_tv': { entity_id: 'media_player.living_room_lg_tv', state: 'unavailable', attributes: {"friendly_name": "LG TV", "device_class": "tv", "supported_features": 24381}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'media_player.living_room_speaker': { entity_id: 'media_player.living_room_speaker', state: 'off', attributes: {"friendly_name": "Living Room speaker", "device_class": "speaker", "supported_features": 152461}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'binary_sensor.reolink_video_doorbell_wifi_visitor': { entity_id: 'binary_sensor.reolink_video_doorbell_wifi_visitor', state: 'off', attributes: {"friendly_name": "Visitor"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'switch.reolink_video_doorbell_wifi_push_notifications': { entity_id: 'switch.reolink_video_doorbell_wifi_push_notifications', state: 'on', attributes: {"friendly_name": "Push notifications"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'sensor.energy_consumed_tariff_1': { entity_id: 'sensor.energy_consumed_tariff_1', state: 'unavailable', attributes: {"state_class": "total_increasing", "unit_of_measurement": "kWh", "device_class": "energy", "friendly_name": "Tariff 1"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'sensor.energy_consumed_tariff_2': { entity_id: 'sensor.energy_consumed_tariff_2', state: 'unavailable', attributes: {"state_class": "total_increasing", "unit_of_measurement": "kWh", "device_class": "energy", "friendly_name": "Tariff 2"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'sensor.grillplats_plug_energy': { entity_id: 'sensor.grillplats_plug_energy', state: 'unavailable', attributes: {"state_class": "total_increasing", "unit_of_measurement": "kWh", "device_class": "energy", "friendly_name": "Plug energy"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'sensor.grillplats_plug_power': { entity_id: 'sensor.grillplats_plug_power', state: 'unavailable', attributes: {"state_class": "measurement", "unit_of_measurement": "W", "device_class": "power", "friendly_name": "Plug power"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'switch.grillplats_plug': { entity_id: 'switch.grillplats_plug', state: 'unavailable', attributes: {"friendly_name": "GRILLPLATS plug"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'script.turn_off_living_room_tv': { entity_id: 'script.turn_off_living_room_tv', state: 'off', attributes: {"friendly_name": "Turn off living room TV"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'camera.reolink_video_doorbell_wifi_fluent': { entity_id: 'camera.reolink_video_doorbell_wifi_fluent', state: 'idle', attributes: {"friendly_name": "Doorbell", "entity_picture": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='9'><rect width='16' height='9' fill='%23456'/></svg>", "access_token": "t"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'camera.192_168_1_156': { entity_id: 'camera.192_168_1_156', state: 'idle', attributes: {"friendly_name": "Doggy cam", "entity_picture": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='9'><rect width='16' height='9' fill='%23654'/></svg>", "access_token": "t"}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.living_room_lights': { entity_id: 'light.living_room_lights', state: 'off', attributes: {"friendly_name": "living_room_lights", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.living_room_wall_light_grp_1': { entity_id: 'light.living_room_wall_light_grp_1', state: 'off', attributes: {"friendly_name": "living_room_wall_light_grp_1", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.dinner_table_light': { entity_id: 'light.dinner_table_light', state: 'off', attributes: {"friendly_name": "dinner_table_light", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.kitchen': { entity_id: 'light.kitchen', state: 'off', attributes: {"friendly_name": "kitchen", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.hallway_lights': { entity_id: 'light.hallway_lights', state: 'off', attributes: {"friendly_name": "hallway_lights", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.entrance_hall_light': { entity_id: 'light.entrance_hall_light', state: 'off', attributes: {"friendly_name": "entrance_hall_light", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.ledstrips_staircase_light': { entity_id: 'light.ledstrips_staircase_light', state: 'off', attributes: {"friendly_name": "ledstrips_staircase_light", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.bedroom_light_1': { entity_id: 'light.bedroom_light_1', state: 'off', attributes: {"friendly_name": "bedroom_light_1", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.bedside_1': { entity_id: 'light.bedside_1', state: 'off', attributes: {"friendly_name": "bedside_1", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.bedside_2': { entity_id: 'light.bedside_2', state: 'off', attributes: {"friendly_name": "bedside_2", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.office_light_1': { entity_id: 'light.office_light_1', state: 'off', attributes: {"friendly_name": "office_light_1", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.0x70ac08fffe838cc2': { entity_id: 'light.0x70ac08fffe838cc2', state: 'off', attributes: {"friendly_name": "0x70ac08fffe838cc2", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.backyard_light_1': { entity_id: 'light.backyard_light_1', state: 'off', attributes: {"friendly_name": "backyard_light_1", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} },
'light.front_door_light': { entity_id: 'light.front_door_light', state: 'off', attributes: {"friendly_name": "front_door_light", "supported_color_modes": ["color_temp"]}, last_changed: new Date(Date.now()-600000).toISOString(), last_updated: new Date(Date.now()-600000).toISOString(), context: {id:'x'} }
}
