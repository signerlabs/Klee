import { Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarFooter } from '@/components/ui/sidebar'
import { useMode } from '@/contexts/ModeContext'

// 以下为 Cloud Mode 切换所需依赖，暂时注释以便后续恢复
// import { Cloud, ShieldCheck } from 'lucide-react'
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
//   AlertDialogTrigger,
// } from '@/components/ui/alert-dialog'
// import { useOllamaSource } from '@/hooks/mode/useOllamaSource'
// import { useAlert } from '@/components/ui/alert-provider'
// import { useQueryClient } from '@tanstack/react-query'
// import { knowledgeBaseKeys } from '@/lib/queryKeys'

/**
 * ModeToggle - 模式切换组件
 *
 * 临时仅开放 Private Mode，Cloud Mode 后续上线时再恢复切换能力。
 */
export function ModeToggle() {
  const { isPrivateMode } = useMode()

  // === Cloud Mode 切换逻辑备份（暂时禁用） ===
  // const { setMode, isPrivateMode } = useMode()
  // const { source, isInitializing } = useOllamaSource()
  // const { showAlert } = useAlert()
  // const queryClient = useQueryClient()
  //
  // const isOllamaAvailable = source === 'system' || source === 'embedded'
  //
  // const handleModeSwitch = () => {
  //   const newMode = isPrivateMode ? 'cloud' : 'private'
  //   setMode(newMode)
  //   queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all })
  //
  //   if (newMode === 'private') {
  //     showAlert({
  //       title: (
  //         <div className="flex items-center gap-2">
  //           <ShieldCheck className="h-4 w-4 text-green-600" />
  //           <span>Switched to Private Mode</span>
  //         </div>
  //       ),
  //       description:
  //         source === 'system'
  //           ? 'Using system Ollama. All data stays on your device.'
  //           : 'Using embedded Ollama. All data stays on your device.',
  //     })
  //   } else {
  //     showAlert({
  //       title: (
  //         <div className="flex items-center gap-2">
  //           <Cloud className="h-4 w-4 text-blue-600" />
  //           <span>Switched to Cloud Mode</span>
  //         </div>
  //       ),
  //       description: 'Connected to cloud services.',
  //     })
  //   }
  // }
  //
  // const shouldDisable = !isPrivateMode && !isOllamaAvailable && !isInitializing
  //
  // const buttonContent = (
  //   <Button
  //     variant="ghost"
  //     disabled={shouldDisable}
  //     className={
  //       isPrivateMode
  //         ? 'text-green-800 w-full justify-start'
  //         : 'text-secondary-foreground w-full justify-start'
  //     }
  //   >
  //     {isPrivateMode ? (
  //       <>
  //         <ShieldCheck className="size-4 mr-2" />
  //         <span className="flex-1 text-left">Private Mode</span>
  //       </>
  //     ) : (
  //       <>
  //         <Cloud className="size-4 mr-2" />
  //         <span className="flex-1 text-left">Cloud Mode</span>
  //       </>
  //     )}
  //   </Button>
  // )
  //
  // return (
  //   <SidebarFooter className="border-sidebar-border border-t">
  //     <AlertDialog>
  //       <AlertDialogTrigger asChild>{buttonContent}</AlertDialogTrigger>
  //       <AlertDialogContent>
  //         {isPrivateMode ? (
  //           <AlertDialogHeader>
  //             <AlertDialogTitle>Switch to Cloud Mode?</AlertDialogTitle>
  //             <AlertDialogDescription>
  //               This will send your data to the cloud for processing. Please ensure you are
  //               comfortable with this before proceeding.
  //             </AlertDialogDescription>
  //           </AlertDialogHeader>
  //         ) : (
  //           <AlertDialogHeader>
  //             <AlertDialogTitle>Switch to Private Mode?</AlertDialogTitle>
  //             <AlertDialogDescription>
  //               This will stop sending your data to the cloud and process everything locally on
  //               your device.
  //             </AlertDialogDescription>
  //           </AlertDialogHeader>
  //         )}
  //         <AlertDialogFooter>
  //           <AlertDialogCancel>Cancel</AlertDialogCancel>
  //           <AlertDialogAction onClick={handleModeSwitch}>Continue</AlertDialogAction>
  //         </AlertDialogFooter>
  //       </AlertDialogContent>
  //     </AlertDialog>
  //   </SidebarFooter>
  // )

  return (
    <SidebarFooter className="border-sidebar-border border-t">
      <Button
        variant="ghost"
        disabled
        className="flex w-full items-center justify-start text-green-800 opacity-75"
      >
        <ShieldCheck className="mr-2 size-4" />
        <span className="flex-1 text-left">
          {isPrivateMode ? 'Private Mode' : 'Private Mode (Activating...)'}
        </span>
        <Lock className="size-4 text-muted-foreground" />
      </Button>
    </SidebarFooter>
  )
}
