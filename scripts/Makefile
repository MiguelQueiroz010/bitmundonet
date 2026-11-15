# Compila o wrapper de créditos/segurança (precisa do PS2SDK: export PS2SDK=/usr/local/ps2dev/ps2sdk)
EE_BIN = raiden_wrapper.elf
EE_OBJS = credits_wrapper.o
EE_LIBS = -lcdvd -lpad -ldebug -lgraph -ldma -lpacket -lkernel -lc
EE_CFLAGS += -O2 -std=gnu99 -fno-pic

all: $(EE_BIN)

clean:
	rm -f $(EE_BIN) $(EE_OBJS)

include $(PS2SDK)/Defs.make
include $(PS2SDK)/samples/Makefile.pref
include $(PS2SDK)/samples/Makefile.eeglobal
