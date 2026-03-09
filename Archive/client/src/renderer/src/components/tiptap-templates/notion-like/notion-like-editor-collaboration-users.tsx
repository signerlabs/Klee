import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { getAvatar } from "@/lib/tiptap-collab-utils"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/tiptap-ui-primitive/avatar"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import {
  Card,
  CardBody,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

type User = { clientId: number; id: string; name: string; color: string }

export function CollaborationUsers() {
  const { editor } = useTiptapEditor()

  if (!editor || !editor.storage.collaborationCaret) {
    return null
  }

  const collaborationUsers: User[] =
    editor.storage.collaborationCaret.users.map((user) => ({
      clientId: user.clientId,
      id: String(user.clientId),
      name: user.name || "Anonymous",
      color: user.color || "#000000",
    }))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-style="ghost"
          data-appearence="subdued"
          style={{ padding: "0.25rem" }}
        >
          <AvatarGroup maxVisible={3}>
            {collaborationUsers.map((user) => (
              <Avatar key={user.id} userColor={user.color}>
                <AvatarImage src={getAvatar(user.name)} />
                <AvatarFallback>{user.name?.toUpperCase()[0]}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <Card>
          <CardBody>
            <CardItemGroup>
              <ButtonGroup>
                {collaborationUsers.map((user) => (
                  <DropdownMenuItem key={user.id} asChild>
                    <Button data-style="ghost">
                      <Avatar userColor={user.color}>
                        <AvatarImage src={getAvatar(user.name)} />
                        <AvatarFallback>
                          {user.name?.toUpperCase()[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="tiptap-button-text">{user.name}</span>
                    </Button>
                  </DropdownMenuItem>
                ))}
              </ButtonGroup>
            </CardItemGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
