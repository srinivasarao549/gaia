
B2G_HOMESCREEN=file://${GAIA}/homescreen.html
INJECTED_GAIA = "$(MOZ_OBJDIR)/_tests/testing/mochitest/browser/gaia"
TEST_PATH=gaia/tests/${TEST_FILE}


mochitest:
	test -L $(INJECTED_GAIA) || ln -s $(GAIA) $(INJECTED_GAIA)
	TEST_PATH=$(TEST_PATH) make -C $(MOZ_OBJDIR) mochitest-browser-chrome EXTRA_TEST_ARGS=--browser-arg=""
