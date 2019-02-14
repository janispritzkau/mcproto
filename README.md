# Minecraft Protocol

This is a small implementation written in typescript. It provides a
connection class which keeps track of the connection state and classes
for reading and writing packets.

It doesn't automatically decode packets except packets like that change
the type of connection like set compression or encryption request. For reading
packets there is a class `PacketReader` which has methods for reading common
data types.
