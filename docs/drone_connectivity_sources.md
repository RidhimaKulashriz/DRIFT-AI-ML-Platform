# DRIFT drone connectivity sources

DRIFT should treat the companion computer as the integration boundary. The browser dashboard must not directly command a flight controller. A Jetson/Raspberry Pi or equivalent companion computer should receive MAVLink telemetry from PX4 or ArduPilot over serial/Ethernet and forward only authenticated inspection telemetry, GPS, camera metadata, and media to DRIFT.

MAVLink can be transported through serial, UDP, or TCP. ArduPilot documents using MAVLink routing between a companion computer serial port and network endpoints. PX4 documents companion computers communicating over a serial port or Ethernet interface. These sources support the recommended hierarchy: MAVLink over serial or UDP/Wi-Fi for telemetry, RTSP/WebRTC or authenticated upload for inspection media, and Bluetooth only for supported low-bandwidth telemetry adapters—not for primary long-range video or flight control.

References:

1. [ArduPilot: Communicating with Raspberry Pi via MAVLink](https://ardupilot.org/dev/docs/raspberry-pi-via-mavlink.html)
2. [PX4: Companion Computers](https://docs.px4.io/main/en/companion_computer/)
3. [ArduPilot: Companion Computers](https://ardupilot.org/dev/docs/companion-computers.html)
4. [MAVLink: Using pymavlink](https://mavlink.io/en/mavgen_python/)

Operational boundary: DRIFT is an inspection and evidence platform. It must not arm, launch, navigate, or otherwise command an aircraft from AI output. Flight-control decisions remain with the qualified operator and the approved ground-control station.
